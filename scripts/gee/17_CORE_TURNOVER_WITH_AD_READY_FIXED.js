/**** 17_CORE_TURNOVER_WITH_AD_READY_FIXED.js
 *
 * 蒙古高原P1—P5高概率GDE核心区转移分析
 *
 * P1 = 2003—2007
 * P5 = 2020—2024
 *
 * 核心区定义：
 * PGDE >= threshold
 *
 * 转移编码：
 * 1 = 稳定核心区
 * 2 = 核心区丧失
 * 3 = 新增核心区
 * 4 = 稳定非核心区
 *
 * 分析内容：
 * 1. 最终全样本pooled RF；
 * 2. fold10 ensemble mean；
 * 3. 核心阈值0.6、0.7、0.8；
 * 4. 共同有效域；
 * 5. broad、relaxed、strict适用域；
 * 6. strict AD + 高置信度；
 * 7. strict AD + 高置信度 + 排除生态混淆环境；
 * 8. core vote >= 0.8严格敏感性。
 *
 * 不显示地图。
 *
 *********************************************************************/


// ======================================================================
// 1. 基础设置
// ======================================================================

var MP = ee.FeatureCollection(
  "projects/YOUR_GEE_PROJECT/assets/MP"
);


// 直接使用原始研究区几何。
// 不使用simplify、bounds或centroid。
var aoi = MP.geometry();

var exportRegion = aoi;


var ASSET_ROOT =
  "projects/YOUR_GEE_PROJECT/assets/menggu";


var DRIVE_FOLDER =
  "MP_GDE_POOLED_V2_CORE_TURNOVER";


var EXPORT_CRS = "EPSG:4326";

var EXPORT_SCALE = 1000;


// 主核心区阈值。
var MAIN_CORE_THRESHOLD = 0.7;


// ======================================================================
// 2. 读取最终全样本RF的P1和P5 PGDE
// ======================================================================

var fullP1 = ee.Image(
  ASSET_ROOT +
  "/MP_PGDE_P1_2003_2007_POOLED_V2_READY_RAW_1KM"
)
  .select(0)
  .rename("PGDE");


var fullP5 = ee.Image(
  ASSET_ROOT +
  "/MP_PGDE_P5_2020_2024_POOLED_V2_READY_RAW_1KM"
)
  .select(0)
  .rename("PGDE");


// ======================================================================
// 3. 读取fold10 ensemble不确定性结果
// ======================================================================

var uncertaintyP1 = ee.Image(
  ASSET_ROOT +
  "/MP_PGDE_UNCERTAINTY_P1_2003_2007_POOLED_V2_READY_FOLD10_1KM"
);


var uncertaintyP5 = ee.Image(
  ASSET_ROOT +
  "/MP_PGDE_UNCERTAINTY_P5_2020_2024_POOLED_V2_READY_FOLD10_1KM"
);


// Ensemble平均PGDE。
var ensembleP1 = uncertaintyP1

  .select("PGDE_ensemble_mean")

  .rename("PGDE");


var ensembleP5 = uncertaintyP5

  .select("PGDE_ensemble_mean")

  .rename("PGDE");


// PGDE>=0.7的10个子模型投票比例。
var coreVoteP1 = uncertaintyP1

  .select("core_vote_0p7");


var coreVoteP5 = uncertaintyP5

  .select("core_vote_0p7");


// ======================================================================
// 4. 读取P1—P5共同有效域
// ======================================================================

var validMasks = ee.Image(
  ASSET_ROOT +
  "/MP_PGDE_VALID_MASKS_POOLED_V2_READY"
);


var commonValid = validMasks

  .select("common_valid_P1_P5")

  .unmask(0)

  .eq(1)

  .rename("domain_common_valid");


// ======================================================================
// 5. 读取P1—P5共同模型适用域
// ======================================================================

var commonAD = ee.Image(
  ASSET_ROOT +
  "/MP_PGDE_AD_COMMON_P1_P5_POOLED_V2_READY_1KM"
);


var commonADStrict = commonAD

  .select("common_AD_strict_P1_P5")

  .unmask(0)

  .eq(1)

  .rename("domain_AD_strict");


var commonADRelaxed = commonAD

  .select("common_AD_relaxed_P1_P5")

  .unmask(0)

  .eq(1)

  .rename("domain_AD_relaxed");


var commonADBroad = commonAD

  .select("common_AD_broad_P1_P5")

  .unmask(0)

  .eq(1)

  .rename("domain_AD_broad");


// ======================================================================
// 6. 读取第16步生成的共同可靠分析域
// ======================================================================

var reliabilityCommon = ee.Image(
  ASSET_ROOT +
  "/MP_PGDE_RELIABILITY_COMMON_P1_P5_POOLED_V2_READY_FIXED_1KM"
);


var commonReliableStrict = reliabilityCommon

  .select("common_reliable_strict_P1_P5")

  .unmask(0)

  .eq(1)

  .rename("domain_reliable_strict");


var commonReliableRelaxed = reliabilityCommon

  .select("common_reliable_relaxed_P1_P5")

  .unmask(0)

  .eq(1)

  .rename("domain_reliable_relaxed");


var commonReliableStrictSensitive = reliabilityCommon

  .select("common_reliable_strict_sensitive_P1_P5")

  .unmask(0)

  .eq(1)

  .rename("domain_reliable_strict_sensitive");


var commonReliableStrictConservative = reliabilityCommon

  .select("common_reliable_strict_conservative_P1_P5")

  .unmask(0)

  .eq(1)

  .rename("domain_reliable_strict_conservative");


var commonReliableNoEco = reliabilityCommon

  .select("common_reliable_no_ecorisk_P1_P5")

  .unmask(0)

  .eq(1)

  .rename("domain_reliable_no_ecorisk");


// ======================================================================
// 7. 检查输入资产波段
// ======================================================================

print(
  "Full P1 PGDE bands:",
  fullP1.bandNames()
);


print(
  "Full P5 PGDE bands:",
  fullP5.bandNames()
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
  "PGDE valid-mask bands:",
  validMasks.bandNames()
);


print(
  "Common AD bands:",
  commonAD.bandNames()
);


print(
  "Common reliability bands:",
  reliabilityCommon.bandNames()
);


// ======================================================================
// 8. 模型来源、分析域和阈值
// ======================================================================

var SOURCES = [

  {
    name:
      "full_model",

    p1:
      fullP1,

    p5:
      fullP5
  },

  {
    name:
      "fold10_ensemble_mean",

    p1:
      ensembleP1,

    p5:
      ensembleP5
  }
];


var DOMAINS = [

  {
    name:
      "common_valid",

    mask:
      commonValid
  },

  {
    name:
      "AD_broad",

    mask:
      commonADBroad
  },

  {
    name:
      "AD_relaxed",

    mask:
      commonADRelaxed
  },

  {
    name:
      "AD_strict",

    mask:
      commonADStrict
  },

  {
    name:
      "reliable_relaxed",

    mask:
      commonReliableRelaxed
  },

  {
    name:
      "reliable_strict",

    mask:
      commonReliableStrict
  },

  {
    name:
      "reliable_strict_sensitive",

    mask:
      commonReliableStrictSensitive
  },

  {
    name:
      "reliable_strict_conservative",

    mask:
      commonReliableStrictConservative
  },

  {
    name:
      "reliable_no_ecorisk",

    mask:
      commonReliableNoEco
  }
];


var THRESHOLDS = [

  0.6,

  0.7,

  0.8
];


// ======================================================================
// 9. 工具函数
// ======================================================================

function safeDivide(
  numerator,
  denominator
) {

  numerator = ee.Number(
    numerator
  );

  denominator = ee.Number(
    denominator
  );


  return ee.Number(
    ee.Algorithms.If(

      denominator.gt(0),

      numerator.divide(
        denominator
      ),

      0
    )
  );
}


function getNumberFromDictionary(
  inputDictionary,
  propertyName
) {

  var dictionary = ee.Dictionary(
    inputDictionary
  );


  return ee.Number(
    ee.Algorithms.If(

      dictionary.contains(
        propertyName
      ),

      dictionary.get(
        propertyName
      ),

      0
    )
  );
}


// ======================================================================
// 10. 构建核心区和转移掩膜
// ======================================================================

function buildCoreMasks(
  p1,
  p5,
  domain,
  threshold
) {

  // 分析域统一将掩膜外区域设为0。
  var domainMask = domain

    .unmask(0)

    .eq(1);


  var coreP1 = p1

    .gte(threshold)

    .and(domainMask)

    .rename("core_P1");


  var coreP5 = p5

    .gte(threshold)

    .and(domainMask)

    .rename("core_P5");


  var stableCore = coreP1

    .and(coreP5)

    .and(domainMask)

    .rename("stable_core");


  var coreLoss = coreP1

    .and(
      coreP5.not()
    )

    .and(domainMask)

    .rename("core_loss");


  var coreGain = coreP1

    .not()

    .and(coreP5)

    .and(domainMask)

    .rename("core_gain");


  var stableNonCore = coreP1

    .not()

    .and(
      coreP5.not()
    )

    .and(domainMask)

    .rename("stable_noncore");


  var coreUnion = coreP1

    .or(coreP5)

    .and(domainMask)

    .rename("core_union");


  return {

    domain:
      domainMask,

    coreP1:
      coreP1,

    coreP5:
      coreP5,

    stable:
      stableCore,

    loss:
      coreLoss,

    gain:
      coreGain,

    stableNonCore:
      stableNonCore,

    union:
      coreUnion
  };
}


// ======================================================================
// 11. 构建核心区转移类别图
// ======================================================================

function buildTransitionImage(
  p1,
  p5,
  domain,
  threshold,
  outputName
) {

  var masks = buildCoreMasks(

    p1,

    p5,

    domain,

    threshold
  );


  // 先将整个分析域设为4：稳定非核心。
  var transition = ee.Image.constant(4)

    .updateMask(
      masks.domain
    )

    .where(
      masks.stable,
      1
    )

    .where(
      masks.loss,
      2
    )

    .where(
      masks.gain,
      3
    )

    .rename(outputName)

    .clip(aoi)

    .toByte();


  return transition;
}


// ======================================================================
// 12. 面积影像
// ======================================================================

var pixelAreaKm2 = ee.Image.pixelArea()

  .divide(1e6);


// ======================================================================
// 13. 计算单个敏感性场景
// ======================================================================

function calculateScenario(
  source,
  domain,
  threshold
) {

  var masks = buildCoreMasks(

    source.p1,

    source.p5,

    domain.mask,

    threshold
  );


  var areaImage = ee.Image.cat([

    pixelAreaKm2
      .updateMask(
        masks.domain
      )
      .rename(
        "domain_area"
      ),


    pixelAreaKm2
      .updateMask(
        masks.coreP1
      )
      .rename(
        "P1_core_area"
      ),


    pixelAreaKm2
      .updateMask(
        masks.coreP5
      )
      .rename(
        "P5_core_area"
      ),


    pixelAreaKm2
      .updateMask(
        masks.stable
      )
      .rename(
        "stable_core_area"
      ),


    pixelAreaKm2
      .updateMask(
        masks.loss
      )
      .rename(
        "core_loss_area"
      ),


    pixelAreaKm2
      .updateMask(
        masks.gain
      )
      .rename(
        "core_gain_area"
      ),


    pixelAreaKm2
      .updateMask(
        masks.stableNonCore
      )
      .rename(
        "stable_noncore_area"
      ),


    pixelAreaKm2
      .updateMask(
        masks.union
      )
      .rename(
        "core_union_area"
      )
  ]);


  var statistics = areaImage.reduceRegion({

    reducer:
      ee.Reducer.sum(),

    geometry:
      aoi,

    scale:
      EXPORT_SCALE,

    crs:
      EXPORT_CRS,

    maxPixels:
      1e13,

    tileScale:
      8
  });


  var domainArea =
    getNumberFromDictionary(
      statistics,
      "domain_area"
    );


  var p1CoreArea =
    getNumberFromDictionary(
      statistics,
      "P1_core_area"
    );


  var p5CoreArea =
    getNumberFromDictionary(
      statistics,
      "P5_core_area"
    );


  var stableArea =
    getNumberFromDictionary(
      statistics,
      "stable_core_area"
    );


  var lossArea =
    getNumberFromDictionary(
      statistics,
      "core_loss_area"
    );


  var gainArea =
    getNumberFromDictionary(
      statistics,
      "core_gain_area"
    );


  var stableNonCoreArea =
    getNumberFromDictionary(
      statistics,
      "stable_noncore_area"
    );


  var unionArea =
    getNumberFromDictionary(
      statistics,
      "core_union_area"
    );


  var netChange =
    p5CoreArea.subtract(
      p1CoreArea
    );


  var grossTurnover =
    lossArea.add(
      gainArea
    );


  // P1面积平衡：
  // stable + loss 应等于P1核心面积。
  var p1BalanceDifference =
    stableArea
      .add(lossArea)
      .subtract(p1CoreArea);


  // P5面积平衡：
  // stable + gain 应等于P5核心面积。
  var p5BalanceDifference =
    stableArea
      .add(gainArea)
      .subtract(p5CoreArea);


  return ee.Feature(null, {

    model_source:
      source.name,

    analysis_domain:
      domain.name,

    core_threshold:
      threshold,


    domain_area_km2:
      domainArea,


    P1_core_area_km2:
      p1CoreArea,

    P5_core_area_km2:
      p5CoreArea,


    core_net_change_km2:
      netChange,

    core_net_change_fraction_of_P1:
      safeDivide(
        netChange,
        p1CoreArea
      ),

    core_net_change_percent_of_P1:
      safeDivide(
        netChange,
        p1CoreArea
      ).multiply(100),


    stable_core_area_km2:
      stableArea,

    core_loss_area_km2:
      lossArea,

    core_gain_area_km2:
      gainArea,

    gross_turnover_area_km2:
      grossTurnover,


    stable_noncore_area_km2:
      stableNonCoreArea,

    core_union_area_km2:
      unionArea,


    P1_core_loss_fraction:
      safeDivide(
        lossArea,
        p1CoreArea
      ),

    P1_core_loss_percent:
      safeDivide(
        lossArea,
        p1CoreArea
      ).multiply(100),


    P5_core_gain_fraction:
      safeDivide(
        gainArea,
        p5CoreArea
      ),

    P5_core_gain_percent:
      safeDivide(
        gainArea,
        p5CoreArea
      ).multiply(100),


    turnover_fraction_of_union:
      safeDivide(
        grossTurnover,
        unionArea
      ),

    turnover_percent_of_union:
      safeDivide(
        grossTurnover,
        unionArea
      ).multiply(100),


    core_jaccard:
      safeDivide(
        stableArea,
        unionArea
      ),


    P1_balance_difference_km2:
      p1BalanceDifference,

    P5_balance_difference_km2:
      p5BalanceDifference
  });
}


// ======================================================================
// 14. 构建最终全样本模型敏感性表
// ======================================================================

var fullModelFeatures = [];


DOMAINS.forEach(function(domain) {

  THRESHOLDS.forEach(function(threshold) {

    fullModelFeatures.push(

      calculateScenario(

        SOURCES[0],

        domain,

        threshold
      )
    );
  });
});


var fullModelSummary =
  ee.FeatureCollection(
    fullModelFeatures
  );


print(
  "Full-model core-turnover sensitivity:",
  fullModelSummary
);


// ======================================================================
// 15. 构建fold10 ensemble mean敏感性表
// ======================================================================

var ensembleFeatures = [];


DOMAINS.forEach(function(domain) {

  THRESHOLDS.forEach(function(threshold) {

    ensembleFeatures.push(

      calculateScenario(

        SOURCES[1],

        domain,

        threshold
      )
    );
  });
});


var ensembleSummary =
  ee.FeatureCollection(
    ensembleFeatures
  );


print(
  "Ensemble-mean core-turnover sensitivity:",
  ensembleSummary
);


// ======================================================================
// 16. 导出最终全模型敏感性表
// ======================================================================

Export.table.toDrive({

  collection:
    fullModelSummary,

  description:
    "MP_GDE_core_turnover_full_model_POOLED_V2_READY",

  folder:
    DRIVE_FOLDER,

  fileNamePrefix:
    "MP_GDE_core_turnover_full_model_POOLED_V2_READY",

  fileFormat:
    "CSV"
});


// ======================================================================
// 17. 导出ensemble mean敏感性表
// ======================================================================

Export.table.toDrive({

  collection:
    ensembleSummary,

  description:
    "MP_GDE_core_turnover_ensemble_mean_POOLED_V2_READY",

  folder:
    DRIVE_FOLDER,

  fileNamePrefix:
    "MP_GDE_core_turnover_ensemble_mean_POOLED_V2_READY",

  fileFormat:
    "CSV"
});


// ======================================================================
// 18. 核心投票>=0.8的严格敏感性
// ======================================================================

function buildVoteCoreMasks(
  domain
) {

  var domainMask = domain

    .unmask(0)

    .eq(1);


  // 至少8/10个子模型将像元判断为PGDE>=0.7核心区。
  var coreP1 = coreVoteP1

    .gte(0.8)

    .and(domainMask)

    .rename("vote_core_P1");


  var coreP5 = coreVoteP5

    .gte(0.8)

    .and(domainMask)

    .rename("vote_core_P5");


  var stable = coreP1

    .and(coreP5)

    .and(domainMask)

    .rename("vote_stable_core");


  var loss = coreP1

    .and(
      coreP5.not()
    )

    .and(domainMask)

    .rename("vote_core_loss");


  var gain = coreP1

    .not()

    .and(coreP5)

    .and(domainMask)

    .rename("vote_core_gain");


  var stableNonCore = coreP1

    .not()

    .and(
      coreP5.not()
    )

    .and(domainMask)

    .rename("vote_stable_noncore");


  var union = coreP1

    .or(coreP5)

    .and(domainMask)

    .rename("vote_core_union");


  return {

    domain:
      domainMask,

    coreP1:
      coreP1,

    coreP5:
      coreP5,

    stable:
      stable,

    loss:
      loss,

    gain:
      gain,

    stableNonCore:
      stableNonCore,

    union:
      union
  };
}


// ======================================================================
// 19. 计算单个投票敏感性场景
// ======================================================================

function calculateVoteScenario(
  domainName,
  domainMask
) {

  var masks = buildVoteCoreMasks(
    domainMask
  );


  var areaImage = ee.Image.cat([

    pixelAreaKm2
      .updateMask(
        masks.domain
      )
      .rename("domain_area"),


    pixelAreaKm2
      .updateMask(
        masks.coreP1
      )
      .rename("P1_core_area"),


    pixelAreaKm2
      .updateMask(
        masks.coreP5
      )
      .rename("P5_core_area"),


    pixelAreaKm2
      .updateMask(
        masks.stable
      )
      .rename("stable_core_area"),


    pixelAreaKm2
      .updateMask(
        masks.loss
      )
      .rename("core_loss_area"),


    pixelAreaKm2
      .updateMask(
        masks.gain
      )
      .rename("core_gain_area"),


    pixelAreaKm2
      .updateMask(
        masks.union
      )
      .rename("core_union_area")
  ]);


  var statistics = areaImage.reduceRegion({

    reducer:
      ee.Reducer.sum(),

    geometry:
      aoi,

    scale:
      EXPORT_SCALE,

    crs:
      EXPORT_CRS,

    maxPixels:
      1e13,

    tileScale:
      8
  });


  var domainArea =
    getNumberFromDictionary(
      statistics,
      "domain_area"
    );


  var p1Area =
    getNumberFromDictionary(
      statistics,
      "P1_core_area"
    );


  var p5Area =
    getNumberFromDictionary(
      statistics,
      "P5_core_area"
    );


  var stableArea =
    getNumberFromDictionary(
      statistics,
      "stable_core_area"
    );


  var lossArea =
    getNumberFromDictionary(
      statistics,
      "core_loss_area"
    );


  var gainArea =
    getNumberFromDictionary(
      statistics,
      "core_gain_area"
    );


  var unionArea =
    getNumberFromDictionary(
      statistics,
      "core_union_area"
    );


  var netChange =
    p5Area.subtract(
      p1Area
    );


  var grossTurnover =
    lossArea.add(
      gainArea
    );


  return ee.Feature(null, {

    model_source:
      "fold10_core_vote_ge_0p8",

    analysis_domain:
      domainName,

    core_threshold:
      0.7,

    core_vote_threshold:
      0.8,


    domain_area_km2:
      domainArea,

    P1_core_area_km2:
      p1Area,

    P5_core_area_km2:
      p5Area,


    core_net_change_km2:
      netChange,

    core_net_change_fraction_of_P1:
      safeDivide(
        netChange,
        p1Area
      ),

    core_net_change_percent_of_P1:
      safeDivide(
        netChange,
        p1Area
      ).multiply(100),


    stable_core_area_km2:
      stableArea,

    core_loss_area_km2:
      lossArea,

    core_gain_area_km2:
      gainArea,

    gross_turnover_area_km2:
      grossTurnover,


    P1_core_loss_fraction:
      safeDivide(
        lossArea,
        p1Area
      ),

    P1_core_loss_percent:
      safeDivide(
        lossArea,
        p1Area
      ).multiply(100),


    turnover_fraction_of_union:
      safeDivide(
        grossTurnover,
        unionArea
      ),

    turnover_percent_of_union:
      safeDivide(
        grossTurnover,
        unionArea
      ).multiply(100),


    core_jaccard:
      safeDivide(
        stableArea,
        unionArea
      )
  });
}


// ======================================================================
// 20. 投票敏感性场景
// ======================================================================

var voteSummary =
  ee.FeatureCollection([

    calculateVoteScenario(
      "common_valid",
      commonValid
    ),

    calculateVoteScenario(
      "AD_broad",
      commonADBroad
    ),

    calculateVoteScenario(
      "AD_relaxed",
      commonADRelaxed
    ),

    calculateVoteScenario(
      "AD_strict",
      commonADStrict
    ),

    calculateVoteScenario(
      "reliable_strict",
      commonReliableStrict
    ),

    calculateVoteScenario(
      "reliable_no_ecorisk",
      commonReliableNoEco
    )
  ]);


print(
  "Core-vote sensitivity:",
  voteSummary
);


Export.table.toDrive({

  collection:
    voteSummary,

  description:
    "MP_GDE_core_turnover_vote_sensitivity_POOLED_V2_READY",

  folder:
    DRIVE_FOLDER,

  fileNamePrefix:
    "MP_GDE_core_turnover_vote_sensitivity_POOLED_V2_READY",

  fileFormat:
    "CSV"
});


// ======================================================================
// 21. 主阈值0.7转移地图
// ======================================================================

// 最终全模型、共同有效域。
var transitionMain = buildTransitionImage(

  fullP1,

  fullP5,

  commonValid,

  MAIN_CORE_THRESHOLD,

  "transition_common_valid_full_t07"
);


// 最终全模型、broad AD。
var transitionADBroad = buildTransitionImage(

  fullP1,

  fullP5,

  commonADBroad,

  MAIN_CORE_THRESHOLD,

  "transition_AD_broad_full_t07"
);


// 最终全模型、relaxed AD。
var transitionADRelaxed = buildTransitionImage(

  fullP1,

  fullP5,

  commonADRelaxed,

  MAIN_CORE_THRESHOLD,

  "transition_AD_relaxed_full_t07"
);


// 最终全模型、strict AD。
var transitionADStrict = buildTransitionImage(

  fullP1,

  fullP5,

  commonADStrict,

  MAIN_CORE_THRESHOLD,

  "transition_AD_strict_full_t07"
);


// 最终全模型、strict AD和高置信度。
var transitionReliableStrict =
  buildTransitionImage(

    fullP1,

    fullP5,

    commonReliableStrict,

    MAIN_CORE_THRESHOLD,

    "transition_reliable_strict_full_t07"
  );


// 最终全模型、排除生态混淆环境。
var transitionNoEco =
  buildTransitionImage(

    fullP1,

    fullP5,

    commonReliableNoEco,

    MAIN_CORE_THRESHOLD,

    "transition_no_ecorisk_full_t07"
  );


// Ensemble mean、strict AD。
var transitionEnsembleAD =
  buildTransitionImage(

    ensembleP1,

    ensembleP5,

    commonADStrict,

    MAIN_CORE_THRESHOLD,

    "transition_AD_strict_ensemble_t07"
  );


// ======================================================================
// 22. Core vote>=0.8转移图
// ======================================================================

var voteMasksADStrict =
  buildVoteCoreMasks(
    commonADStrict
  );


var transitionVoteADStrict =
  ee.Image.constant(4)

    .updateMask(
      voteMasksADStrict.domain
    )

    .where(
      voteMasksADStrict.stable,
      1
    )

    .where(
      voteMasksADStrict.loss,
      2
    )

    .where(
      voteMasksADStrict.gain,
      3
    )

    .rename(
      "transition_AD_strict_vote_ge_0p8"
    )

    .clip(aoi)

    .toByte();


// ======================================================================
// 23. 输出主核心区、丧失、新增掩膜
// ======================================================================

var mainMasks = buildCoreMasks(

  fullP1,

  fullP5,

  commonValid,

  MAIN_CORE_THRESHOLD
);


var strictADMasks = buildCoreMasks(

  fullP1,

  fullP5,

  commonADStrict,

  MAIN_CORE_THRESHOLD
);


var reliableMasks = buildCoreMasks(

  fullP1,

  fullP5,

  commonReliableStrict,

  MAIN_CORE_THRESHOLD
);


// ======================================================================
// 24. 构建最终核心区转移影像栈
// ======================================================================

var outputStack = transitionMain

  .addBands(
    transitionADBroad
  )

  .addBands(
    transitionADRelaxed
  )

  .addBands(
    transitionADStrict
  )

  .addBands(
    transitionReliableStrict
  )

  .addBands(
    transitionNoEco
  )

  .addBands(
    transitionEnsembleAD
  )

  .addBands(
    transitionVoteADStrict
  )


  // 主分析P1/P5核心区。
  .addBands(
    mainMasks.coreP1
      .rename(
        "P1_core_main_t07"
      )
      .toByte()
  )

  .addBands(
    mainMasks.coreP5
      .rename(
        "P5_core_main_t07"
      )
      .toByte()
  )


  // 主分析转移。
  .addBands(
    mainMasks.stable
      .rename(
        "stable_core_main_t07"
      )
      .toByte()
  )

  .addBands(
    mainMasks.loss
      .rename(
        "core_loss_main_t07"
      )
      .toByte()
  )

  .addBands(
    mainMasks.gain
      .rename(
        "core_gain_main_t07"
      )
      .toByte()
  )


  // Strict AD转移。
  .addBands(
    strictADMasks.stable
      .rename(
        "stable_core_AD_strict_t07"
      )
      .toByte()
  )

  .addBands(
    strictADMasks.loss
      .rename(
        "core_loss_AD_strict_t07"
      )
      .toByte()
  )

  .addBands(
    strictADMasks.gain
      .rename(
        "core_gain_AD_strict_t07"
      )
      .toByte()
  )


  // 共同可靠域转移。
  .addBands(
    reliableMasks.stable
      .rename(
        "stable_core_reliable_t07"
      )
      .toByte()
  )

  .addBands(
    reliableMasks.loss
      .rename(
        "core_loss_reliable_t07"
      )
      .toByte()
  )

  .addBands(
    reliableMasks.gain
      .rename(
        "core_gain_reliable_t07"
      )
      .toByte()
  )


  // Vote-based严格场景。
  .addBands(
    voteMasksADStrict.coreP1
      .rename(
        "P1_core_vote_AD_strict_t07"
      )
      .toByte()
  )

  .addBands(
    voteMasksADStrict.coreP5
      .rename(
        "P5_core_vote_AD_strict_t07"
      )
      .toByte()
  )

  .addBands(
    voteMasksADStrict.loss
      .rename(
        "core_loss_vote_AD_strict_t07"
      )
      .toByte()
  )

  .addBands(
    voteMasksADStrict.gain
      .rename(
        "core_gain_vote_AD_strict_t07"
      )
      .toByte()
  )

  .clip(aoi);


// ======================================================================
// 25. 导出核心区转移影像资产
// ======================================================================

Export.image.toAsset({

  image:
    outputStack,

  description:
    "ASSET_MP_GDE_CORE_TURNOVER_MAPS_POOLED_V2_READY_FIXED_T07_1KM",

  assetId:
    ASSET_ROOT +
    "/MP_GDE_CORE_TURNOVER_MAPS_POOLED_V2_READY_FIXED_T07_1KM",

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
// 26. 最终检查
// ======================================================================

print(
  "Output core-turnover bands:",
  outputStack.bandNames()
);


print(
  "Full-model sensitivity scenarios:",
  fullModelSummary.size()
);


print(
  "Expected full-model scenarios:",
  DOMAINS.length * THRESHOLDS.length
);


print(
  "Ensemble sensitivity scenarios:",
  ensembleSummary.size()
);


print(
  "Expected ensemble scenarios:",
  DOMAINS.length * THRESHOLDS.length
);


print(
  "Vote sensitivity scenarios:",
  voteSummary.size()
);


print(
  "Expected output asset:",
  ASSET_ROOT +
  "/MP_GDE_CORE_TURNOVER_MAPS_POOLED_V2_READY_FIXED_T07_1KM"
);


print(
  "Step 17 core-turnover export tasks created."
);
