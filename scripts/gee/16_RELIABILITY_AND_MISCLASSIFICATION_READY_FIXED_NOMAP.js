/**** 16_RELIABILITY_AND_MISCLASSIFICATION_READY_FIXED_NOMAP.js
 *
 * 蒙古高原PGDE可靠性、生态混淆与模型外推区域
 *
 * 输出内容：
 * 1. 高地草地/灌丛生态混淆环境；
 * 2. 山地森林生态混淆环境；
 * 3. 湿润远水天然植被混淆环境；
 * 4. 超出训练环境范围区域；
 * 5. ensemble低置信度区域；
 * 6. P1—P5共同可靠分析域。
 *
 * 本修正版：
 * - 不显示地图；
 * - 不使用Map.*；
 * - 不使用Geometry.simplify/bounds/centroid；
 * - 不使用任何ee.Reducer；
 * - 不执行reduceRegion；
 * - 采用预先固定的不确定性阈值；
 * - 面积统计在第17步统一完成。
 *
 *********************************************************************/


// ======================================================================
// 1. 基础设置
// ======================================================================

var MP = ee.FeatureCollection(
  "projects/YOUR_GEE_PROJECT/assets/MP"
);


// 直接使用原始蒙古高原几何。
// 不使用simplify、bounds或centroid。
var aoi = MP.geometry();


// 直接把研究区几何作为导出范围。
var exportRegion = aoi;


var ASSET_ROOT =
  "projects/YOUR_GEE_PROJECT/assets/menggu";


var EXPORT_CRS = "EPSG:4326";

var EXPORT_SCALE = 1000;


// ======================================================================
// 2. 固定的不确定性阈值
// ======================================================================
//
// PGDE概率范围为0—1。
//
// 主低置信度判定：
// 1. ensemble SD >= 0.05；
// 2. ensemble range >= 0.15；
// 3. ensemble mean位于0.60—0.80；
// 4. core vote位于0.20—0.80。
//
// 同时输出宽松和严格阈值，供后续敏感性分析。
// ======================================================================


// Ensemble SD阈值。
var SD_THRESHOLD_LOW = 0.03;

var SD_THRESHOLD_MAIN = 0.05;

var SD_THRESHOLD_HIGH = 0.07;


// Ensemble预测范围阈值。
var RANGE_THRESHOLD_LOW = 0.10;

var RANGE_THRESHOLD_MAIN = 0.15;

var RANGE_THRESHOLD_HIGH = 0.20;


// 高概率GDE核心区阈值。
var CORE_THRESHOLD = 0.70;


// 核心阈值附近的不稳定范围。
var CORE_MARGIN_LOWER = 0.60;

var CORE_MARGIN_UPPER = 0.80;


// 10个子模型核心投票的分歧范围。
var CORE_VOTE_LOWER = 0.20;

var CORE_VOTE_UPPER = 0.80;


// ======================================================================
// 3. 读取P1、P5 predictor资产
// ======================================================================

var predictorP1 = ee.Image(
  ASSET_ROOT +
  "/MP_PREDICTORS_P1_2003_2007_POOLED_V2_1KM"
);


var predictorP5 = ee.Image(
  ASSET_ROOT +
  "/MP_PREDICTORS_P5_2020_2024_POOLED_V2_1KM"
);


// ======================================================================
// 4. 读取P1、P5 fold10 ensemble不确定性资产
// ======================================================================

var uncertaintyP1 = ee.Image(
  ASSET_ROOT +
  "/MP_PGDE_UNCERTAINTY_P1_2003_2007_POOLED_V2_READY_FOLD10_1KM"
);


var uncertaintyP5 = ee.Image(
  ASSET_ROOT +
  "/MP_PGDE_UNCERTAINTY_P5_2020_2024_POOLED_V2_READY_FOLD10_1KM"
);


// ======================================================================
// 5. 读取P1、P5适用域资产
// ======================================================================

var adP1 = ee.Image(
  ASSET_ROOT +
  "/MP_PGDE_AD_P1_2003_2007_POOLED_V2_READY_Q01_Q99_1KM"
);


var adP5 = ee.Image(
  ASSET_ROOT +
  "/MP_PGDE_AD_P5_2020_2024_POOLED_V2_READY_Q01_Q99_1KM"
);


// P1—P5共同适用域。
var commonAD = ee.Image(
  ASSET_ROOT +
  "/MP_PGDE_AD_COMMON_P1_P5_POOLED_V2_READY_1KM"
);


// ======================================================================
// 6. 输入资产波段检查
// ======================================================================

print(
  "P1 predictor bands:",
  predictorP1.bandNames()
);


print(
  "P5 predictor bands:",
  predictorP5.bandNames()
);


print(
  "P1 uncertainty bands:",
  uncertaintyP1.bandNames()
);


print(
  "P5 uncertainty bands:",
  uncertaintyP5.bandNames()
);


print(
  "P1 applicability-domain bands:",
  adP1.bandNames()
);


print(
  "P5 applicability-domain bands:",
  adP5.bandNames()
);


print(
  "Common applicability-domain bands:",
  commonAD.bandNames()
);


// uncertainty资产必须含有：
// PGDE_ensemble_mean
// PGDE_ensemble_sd
// PGDE_ensemble_range
// core_vote_0p7
// ensemble_model_count
//
// 单期AD资产必须含有：
// AD_strict
// AD_relaxed
//
// commonAD资产必须含有：
// common_AD_strict_P1_P5
// common_AD_relaxed_P1_P5


// ======================================================================
// 7. 构建生态误判风险环境
// ======================================================================

function buildEcologicalRisk(predictor) {

  // ------------------------------------------------------
  // 7.1 高地草地/灌丛
  // ------------------------------------------------------
  //
  // 特征：
  // - 草地或灌丛占比高；
  // - HAND较高；
  // - 远离稳定水体和季节性水体；
  // - 水体频率低；
  // - 植被生产力较高；
  // - 排除明显耕地和建成区。

  var uplandGrass = predictor

    .select("grass_shrub_frac")
    .gt(0.60)

    .and(
      predictor
        .select("HAND")
        .gt(30)
    )

    .and(
      predictor
        .select("dist_persistent_water")
        .gt(5000)
    )

    .and(
      predictor
        .select("dist_seasonal_water")
        .gt(5000)
    )

    .and(
      predictor
        .select("water_frequency")
        .lt(0.05)
    )

    .and(
      predictor
        .select("NDVI_mean")
        .gt(0.15)
    )

    .and(
      predictor
        .select("cropland_frac")
        .lt(0.20)
    )

    .and(
      predictor
        .select("built_frac")
        .lt(0.10)
    )

    .rename("upland_grass_risk")

    .toByte();


  // ------------------------------------------------------
  // 7.2 山地森林
  // ------------------------------------------------------
  //
  // 特征：
  // - 森林占比高；
  // - HAND较高或坡度较大；
  // - 远离地表水；
  // - 水体频率较低；
  // - NDVI较高。

  var mountainTerrain = predictor

    .select("HAND")
    .gt(30)

    .or(
      predictor
        .select("slope")
        .gt(10)
    );


  var mountainForest = predictor

    .select("forest_frac")
    .gt(0.60)

    .and(mountainTerrain)

    .and(
      predictor
        .select("dist_persistent_water")
        .gt(5000)
    )

    .and(
      predictor
        .select("dist_seasonal_water")
        .gt(5000)
    )

    .and(
      predictor
        .select("water_frequency")
        .lt(0.05)
    )

    .and(
      predictor
        .select("NDVI_mean")
        .gt(0.20)
    )

    .rename("mountain_forest_risk")

    .toByte();


  // ------------------------------------------------------
  // 7.3 湿润远水天然植被
  // ------------------------------------------------------

  var humidBackground = predictor

    .select("Aridity_index")
    .gte(0.65)

    .or(
      predictor
        .select("PDSI_mean")
        .gte(0)
    );


  var wetFarNatural = humidBackground

    .and(
      predictor
        .select("HAND")
        .gt(20)
    )

    .and(
      predictor
        .select("dist_persistent_water")
        .gt(5000)
    )

    .and(
      predictor
        .select("dist_seasonal_water")
        .gt(5000)
    )

    .and(
      predictor
        .select("water_frequency")
        .lt(0.05)
    )

    .and(
      predictor
        .select("NDVI_mean")
        .gt(0.20)
    )

    .and(
      predictor
        .select("cropland_frac")
        .lt(0.20)
    )

    .and(
      predictor
        .select("built_frac")
        .lt(0.10)
    )

    .rename("wet_far_natural_risk")

    .toByte();


  // ------------------------------------------------------
  // 7.4 组合生态风险类型
  // ------------------------------------------------------
  //
  // 0 = 不属于重点生态混淆环境
  // 1 = 高地草地/灌丛
  // 2 = 山地森林
  // 3 = 湿润远水天然植被
  //
  // 后写入的类别具有更高显示优先级。

  var ecologicalRiskType = ee.Image.constant(0)

    .where(
      uplandGrass.eq(1),
      1
    )

    .where(
      mountainForest.eq(1),
      2
    )

    .where(
      wetFarNatural.eq(1),
      3
    )

    .rename("ecological_risk_type")

    .toByte();


  var ecologicalRiskAny = uplandGrass

    .or(mountainForest)

    .or(wetFarNatural)

    .rename("ecological_risk_any")

    .toByte();


  return ecologicalRiskType

    .addBands(uplandGrass)

    .addBands(mountainForest)

    .addBands(wetFarNatural)

    .addBands(ecologicalRiskAny)

    .clip(aoi);
}


// ======================================================================
// 8. 构建单期可靠性
// ======================================================================

function buildReliability(
  predictor,
  uncertainty,
  ad,
  periodName
) {

  // ------------------------------------------------------
  // 8.1 Predictor有效域
  // ------------------------------------------------------
  //
  // Predictor构建时所有波段已经共同应用modelValid掩膜。
  // 因此直接使用NDVI_mean的mask。

  var predictorValid = predictor

    .select("NDVI_mean")

    .mask()

    .gt(0)

    .rename("predictor_valid")

    .toByte();


  // ------------------------------------------------------
  // 8.2 Ensemble有效域
  // ------------------------------------------------------
  //
  // 必须10个空间fold子模型均有有效预测。

  var ensembleValid = uncertainty

    .select("ensemble_model_count")

    .eq(10)

    .rename("ensemble_valid")

    .toByte();


  var reliabilityValid = predictorValid

    .and(ensembleValid)

    .rename("reliability_valid")

    .toByte();


  // ------------------------------------------------------
  // 8.3 生态混淆环境
  // ------------------------------------------------------

  var ecologicalRisk = buildEcologicalRisk(
    predictor
  );


  var ecologicalRiskAny = ecologicalRisk

    .select("ecological_risk_any");


  // ------------------------------------------------------
  // 8.4 Ensemble主要变量
  // ------------------------------------------------------

  var ensembleMean = uncertainty

    .select("PGDE_ensemble_mean");


  var ensembleSd = uncertainty

    .select("PGDE_ensemble_sd");


  var ensembleRange = uncertainty

    .select("PGDE_ensemble_range");


  var coreVote = uncertainty

    .select("core_vote_0p7");


  // ------------------------------------------------------
  // 8.5 Ensemble SD阈值敏感性
  // ------------------------------------------------------

  var highSdLow = ensembleSd

    .gte(SD_THRESHOLD_LOW)

    .rename("high_sd_ge_0p03")

    .toByte();


  var highSdMain = ensembleSd

    .gte(SD_THRESHOLD_MAIN)

    .rename("high_sd_ge_0p05")

    .toByte();


  var highSdHigh = ensembleSd

    .gte(SD_THRESHOLD_HIGH)

    .rename("high_sd_ge_0p07")

    .toByte();


  // ------------------------------------------------------
  // 8.6 Ensemble range阈值敏感性
  // ------------------------------------------------------

  var highRangeLow = ensembleRange

    .gte(RANGE_THRESHOLD_LOW)

    .rename("high_range_ge_0p10")

    .toByte();


  var highRangeMain = ensembleRange

    .gte(RANGE_THRESHOLD_MAIN)

    .rename("high_range_ge_0p15")

    .toByte();


  var highRangeHigh = ensembleRange

    .gte(RANGE_THRESHOLD_HIGH)

    .rename("high_range_ge_0p20")

    .toByte();


  // ------------------------------------------------------
  // 8.7 接近PGDE=0.7核心阈值
  // ------------------------------------------------------

  var coreThresholdMargin = ensembleMean

    .gte(CORE_MARGIN_LOWER)

    .and(
      ensembleMean.lte(
        CORE_MARGIN_UPPER
      )
    )

    .rename("core_threshold_margin")

    .toByte();


  // ------------------------------------------------------
  // 8.8 子模型核心判定分歧
  // ------------------------------------------------------

  var ambiguousCoreVote = coreVote

    .gt(CORE_VOTE_LOWER)

    .and(
      coreVote.lt(
        CORE_VOTE_UPPER
      )
    )

    .rename("ambiguous_core_vote")

    .toByte();


  // ------------------------------------------------------
  // 8.9 主低置信度定义
  // ------------------------------------------------------

  var lowConfidence = highSdMain

    .or(highRangeMain)

    .or(coreThresholdMargin)

    .or(ambiguousCoreVote)

    .rename("low_confidence")

    .toByte();


  // ------------------------------------------------------
  // 8.10 较敏感低置信度情景
  // ------------------------------------------------------
  //
  // 阈值更低，因此判定为低置信度的面积会更大。

  var lowConfidenceSensitive = highSdLow

    .or(highRangeLow)

    .or(coreThresholdMargin)

    .or(ambiguousCoreVote)

    .rename(
      "low_confidence_sensitive"
    )

    .toByte();


  // ------------------------------------------------------
  // 8.11 较保守低置信度情景
  // ------------------------------------------------------
  //
  // SD和range阈值更高，因此低置信度面积更小。

  var lowConfidenceConservative = highSdHigh

    .or(highRangeHigh)

    .or(coreThresholdMargin)

    .or(ambiguousCoreVote)

    .rename(
      "low_confidence_conservative"
    )

    .toByte();


  // ------------------------------------------------------
  // 8.12 超出模型适用域
  // ------------------------------------------------------

  var outsideStrictAD = ad

    .select("AD_strict")

    .neq(1)

    .rename("outside_AD_strict")

    .toByte();


  var outsideRelaxedAD = ad

    .select("AD_relaxed")

    .neq(1)

    .rename("outside_AD_relaxed")

    .toByte();


  // ------------------------------------------------------
  // 8.13 问题叠加数量
  // ------------------------------------------------------

  var issueCount = ecologicalRiskAny

    .add(outsideStrictAD)

    .add(lowConfidence)

    .rename("issue_count")

    .toByte();


  // ------------------------------------------------------
  // 8.14 可靠性分类
  // ------------------------------------------------------
  //
  // 1 = 相对可靠
  // 2 = 生态混淆环境
  // 3 = 超出严格适用域
  // 4 = 低置信度
  // 5 = 两种或以上问题叠加

  var reliabilityClass = ee.Image.constant(1)

    .where(
      ecologicalRiskAny.eq(1)
        .and(outsideStrictAD.eq(0))
        .and(lowConfidence.eq(0)),
      2
    )

    .where(
      outsideStrictAD.eq(1)
        .and(ecologicalRiskAny.eq(0))
        .and(lowConfidence.eq(0)),
      3
    )

    .where(
      lowConfidence.eq(1)
        .and(ecologicalRiskAny.eq(0))
        .and(outsideStrictAD.eq(0)),
      4
    )

    .where(
      issueCount.gte(2),
      5
    )

    .rename("reliability_class")

    .toByte();


  // ------------------------------------------------------
  // 8.15 输出
  // ------------------------------------------------------

  return ecologicalRisk

    .addBands(outsideStrictAD)

    .addBands(outsideRelaxedAD)

    .addBands(highSdLow)

    .addBands(highSdMain)

    .addBands(highSdHigh)

    .addBands(highRangeLow)

    .addBands(highRangeMain)

    .addBands(highRangeHigh)

    .addBands(coreThresholdMargin)

    .addBands(ambiguousCoreVote)

    .addBands(lowConfidence)

    .addBands(lowConfidenceSensitive)

    .addBands(
      lowConfidenceConservative
    )

    .addBands(issueCount)

    .addBands(reliabilityClass)

    .addBands(predictorValid)

    .addBands(ensembleValid)

    .addBands(reliabilityValid)

    .updateMask(reliabilityValid)

    .clip(aoi)

    .set({
      period:
        periodName,

      sd_threshold_low:
        SD_THRESHOLD_LOW,

      sd_threshold_main:
        SD_THRESHOLD_MAIN,

      sd_threshold_high:
        SD_THRESHOLD_HIGH,

      range_threshold_low:
        RANGE_THRESHOLD_LOW,

      range_threshold_main:
        RANGE_THRESHOLD_MAIN,

      range_threshold_high:
        RANGE_THRESHOLD_HIGH,

      core_threshold:
        CORE_THRESHOLD,

      core_margin_lower:
        CORE_MARGIN_LOWER,

      core_margin_upper:
        CORE_MARGIN_UPPER,

      core_vote_lower:
        CORE_VOTE_LOWER,

      core_vote_upper:
        CORE_VOTE_UPPER
    });
}


// ======================================================================
// 9. 分别计算P1和P5可靠性
// ======================================================================

var reliabilityP1 = buildReliability(
  predictorP1,
  uncertaintyP1,
  adP1,
  "P1_2003_2007"
);


var reliabilityP5 = buildReliability(
  predictorP5,
  uncertaintyP5,
  adP5,
  "P5_2020_2024"
);


print(
  "P1 reliability bands:",
  reliabilityP1.bandNames()
);


print(
  "P5 reliability bands:",
  reliabilityP5.bandNames()
);


// ======================================================================
// 10. P1—P5共同高置信度区域
// ======================================================================

var commonHighConfidence = reliabilityP1

  .select("low_confidence")

  .eq(0)

  .and(
    reliabilityP5
      .select("low_confidence")
      .eq(0)
  )

  .rename(
    "common_high_confidence_P1_P5"
  )

  .toByte();


var commonHighConfidenceSensitive =
  reliabilityP1

    .select(
      "low_confidence_sensitive"
    )

    .eq(0)

    .and(
      reliabilityP5

        .select(
          "low_confidence_sensitive"
        )

        .eq(0)
    )

    .rename(
      "common_high_confidence_sensitive_P1_P5"
    )

    .toByte();


var commonHighConfidenceConservative =
  reliabilityP1

    .select(
      "low_confidence_conservative"
    )

    .eq(0)

    .and(
      reliabilityP5

        .select(
          "low_confidence_conservative"
        )

        .eq(0)
    )

    .rename(
      "common_high_confidence_conservative_P1_P5"
    )

    .toByte();


// ======================================================================
// 11. 与P1—P5共同适用域结合
// ======================================================================

var commonADStrict = commonAD

  .select(
    "common_AD_strict_P1_P5"
  )

  .eq(1);


var commonADRelaxed = commonAD

  .select(
    "common_AD_relaxed_P1_P5"
  )

  .eq(1);


var commonReliableStrict = commonADStrict

  .and(commonHighConfidence)

  .rename(
    "common_reliable_strict_P1_P5"
  )

  .toByte();


var commonReliableRelaxed = commonADRelaxed

  .and(commonHighConfidence)

  .rename(
    "common_reliable_relaxed_P1_P5"
  )

  .toByte();


var commonReliableStrictSensitive =
  commonADStrict

    .and(
      commonHighConfidenceSensitive
    )

    .rename(
      "common_reliable_strict_sensitive_P1_P5"
    )

    .toByte();


var commonReliableStrictConservative =
  commonADStrict

    .and(
      commonHighConfidenceConservative
    )

    .rename(
      "common_reliable_strict_conservative_P1_P5"
    )

    .toByte();


// ======================================================================
// 12. 排除生态混淆环境的共同可靠域
// ======================================================================

var ecologicalRiskP1 = reliabilityP1

  .select("ecological_risk_any")

  .eq(1);


var ecologicalRiskP5 = reliabilityP5

  .select("ecological_risk_any")

  .eq(1);


var commonReliableNoEcoRisk =
  commonReliableStrict

    .and(
      ecologicalRiskP1.not()
    )

    .and(
      ecologicalRiskP5.not()
    )

    .rename(
      "common_reliable_no_ecorisk_P1_P5"
    )

    .toByte();


// ======================================================================
// 13. 共同可靠分析域输出栈
// ======================================================================

var commonReliabilityStack =
  commonHighConfidence

    .addBands(
      commonHighConfidenceSensitive
    )

    .addBands(
      commonHighConfidenceConservative
    )

    .addBands(
      commonReliableStrict
    )

    .addBands(
      commonReliableRelaxed
    )

    .addBands(
      commonReliableStrictSensitive
    )

    .addBands(
      commonReliableStrictConservative
    )

    .addBands(
      commonReliableNoEcoRisk
    )

    .clip(aoi);


// ======================================================================
// 14. 图16综合资产
// ======================================================================
//
// 后续可在ArcGIS、QGIS或Python中分别绘制：
//
// (a) ecological_risk_type
// (b) outside_AD_strict
// (c) low_confidence
// (d) common_reliable_strict_P1_P5

var figure16Stack = reliabilityP5

  .select([
    "ecological_risk_type",
    "upland_grass_risk",
    "mountain_forest_risk",
    "wet_far_natural_risk",
    "ecological_risk_any",
    "outside_AD_strict",
    "outside_AD_relaxed",
    "low_confidence",
    "low_confidence_sensitive",
    "low_confidence_conservative",
    "reliability_class"
  ])

  .addBands(
    commonReliableStrict
  )

  .addBands(
    commonReliableRelaxed
  )

  .addBands(
    commonReliableNoEcoRisk
  )

  .clip(aoi);


// ======================================================================
// 15. 导出P1可靠性资产
// ======================================================================

Export.image.toAsset({

  image:
    reliabilityP1,

  description:
    "ASSET_MP_PGDE_RELIABILITY_P1_2003_2007_POOLED_V2_READY_FIXED_1KM",

  assetId:
    ASSET_ROOT +
    "/MP_PGDE_RELIABILITY_P1_2003_2007_POOLED_V2_READY_FIXED_1KM",

  region:
    exportRegion,

  crs:
    EXPORT_CRS,

  scale:
    EXPORT_SCALE,

  maxPixels:
    1e13,

  pyramidingPolicy: {
    ".default":
      "mode"
  }
});


// ======================================================================
// 16. 导出P5可靠性资产
// ======================================================================

Export.image.toAsset({

  image:
    reliabilityP5,

  description:
    "ASSET_MP_PGDE_RELIABILITY_P5_2020_2024_POOLED_V2_READY_FIXED_1KM",

  assetId:
    ASSET_ROOT +
    "/MP_PGDE_RELIABILITY_P5_2020_2024_POOLED_V2_READY_FIXED_1KM",

  region:
    exportRegion,

  crs:
    EXPORT_CRS,

  scale:
    EXPORT_SCALE,

  maxPixels:
    1e13,

  pyramidingPolicy: {
    ".default":
      "mode"
  }
});


// ======================================================================
// 17. 导出P1—P5共同可靠分析域
// ======================================================================

Export.image.toAsset({

  image:
    commonReliabilityStack,

  description:
    "ASSET_MP_PGDE_RELIABILITY_COMMON_P1_P5_POOLED_V2_READY_FIXED_1KM",

  assetId:
    ASSET_ROOT +
    "/MP_PGDE_RELIABILITY_COMMON_P1_P5_POOLED_V2_READY_FIXED_1KM",

  region:
    exportRegion,

  crs:
    EXPORT_CRS,

  scale:
    EXPORT_SCALE,

  maxPixels:
    1e13,

  pyramidingPolicy: {
    ".default":
      "mode"
  }
});


// ======================================================================
// 18. 导出图16综合资产
// ======================================================================

Export.image.toAsset({

  image:
    figure16Stack,

  description:
    "ASSET_MP_PGDE_FIG16_RELIABILITY_STACK_POOLED_V2_READY_FIXED_1KM",

  assetId:
    ASSET_ROOT +
    "/MP_PGDE_FIG16_RELIABILITY_STACK_POOLED_V2_READY_FIXED_1KM",

  region:
    exportRegion,

  crs:
    EXPORT_CRS,

  scale:
    EXPORT_SCALE,

  maxPixels:
    1e13,

  pyramidingPolicy: {
    ".default":
      "mode"
  }
});


// ======================================================================
// 19. 输出检查信息
// ======================================================================

print(
  "Common reliability bands:",
  commonReliabilityStack.bandNames()
);


print(
  "Figure 16 stack bands:",
  figure16Stack.bandNames()
);


print(
  "Expected export asset 1:",
  ASSET_ROOT +
  "/MP_PGDE_RELIABILITY_P1_2003_2007_POOLED_V2_READY_FIXED_1KM"
);


print(
  "Expected export asset 2:",
  ASSET_ROOT +
  "/MP_PGDE_RELIABILITY_P5_2020_2024_POOLED_V2_READY_FIXED_1KM"
);


print(
  "Expected export asset 3:",
  ASSET_ROOT +
  "/MP_PGDE_RELIABILITY_COMMON_P1_P5_POOLED_V2_READY_FIXED_1KM"
);


print(
  "Expected export asset 4:",
  ASSET_ROOT +
  "/MP_PGDE_FIG16_RELIABILITY_STACK_POOLED_V2_READY_FIXED_1KM"
);


print(
  "Step 16 fixed no-map export tasks created."
);
