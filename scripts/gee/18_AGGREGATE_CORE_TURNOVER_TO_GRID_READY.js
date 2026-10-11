/**** 18_AGGREGATE_CORE_TURNOVER_TO_GRID_READY.js
 *
 * 不重新训练模型。
 * 将已有1 km PGDE、核心稳定/丧失/新增和可靠域
 * 汇总到既有NDVI-GWSA解耦网格。
 *
 * 输出：
 * MP_grid_core_turnover_POOLED_V2_READY_t07.csv
 *
 *********************************************************************/


// ======================================================================
// 1. 基础设置
// ======================================================================

var MP = ee.FeatureCollection(
  "projects/YOUR_GEE_PROJECT/assets/MP"
);

var aoi = MP.geometry();

var ASSET_ROOT =
  "projects/YOUR_GEE_PROJECT/assets/menggu";

var DRIVE_FOLDER =
  "MP_GDE_POOLED_V2_GRID_RESULTS";

var SCALE = 1000;
var CRS = "EPSG:4326";


// ======================================================================
// 2. 解耦网格
// ======================================================================

var decouplingGrid = ee.FeatureCollection(
  ASSET_ROOT +
  "/MP_NDVI_GWSA_decoupling_grid_1deg"
);

print("Grid count:", decouplingGrid.size());
print("First grid:", decouplingGrid.first());


// ======================================================================
// 3. P1和P5 PGDE
// ======================================================================

var pgdeP1 = ee.Image(
  ASSET_ROOT +
  "/MP_PGDE_P1_2003_2007_POOLED_V2_READY_RAW_1KM"
).select(0).rename("PGDE_P1");


var pgdeP5 = ee.Image(
  ASSET_ROOT +
  "/MP_PGDE_P5_2020_2024_POOLED_V2_READY_RAW_1KM"
).select(0).rename("PGDE_P5");


var deltaPGDE = pgdeP5
  .subtract(pgdeP1)
  .rename("Delta_PGDE");


// ======================================================================
// 4. 第17步核心区转移资产
// ======================================================================

var turnover = ee.Image(
  ASSET_ROOT +
  "/MP_GDE_CORE_TURNOVER_MAPS_POOLED_V2_READY_FIXED_T07_1KM"
);


print("Turnover bands:", turnover.bandNames());


var coreP1 = turnover
  .select("P1_core_main_t07")
  .unmask(0)
  .eq(1)
  .rename("core_P1");


var coreP5 = turnover
  .select("P5_core_main_t07")
  .unmask(0)
  .eq(1)
  .rename("core_P5");


var stableCore = turnover
  .select("stable_core_main_t07")
  .unmask(0)
  .eq(1)
  .rename("stable_core");


var coreLoss = turnover
  .select("core_loss_main_t07")
  .unmask(0)
  .eq(1)
  .rename("core_loss");


var coreGain = turnover
  .select("core_gain_main_t07")
  .unmask(0)
  .eq(1)
  .rename("core_gain");


// ======================================================================
// 5. P1-P5共同有效域
// ======================================================================

var validMasks = ee.Image(
  ASSET_ROOT +
  "/MP_PGDE_VALID_MASKS_POOLED_V2_READY"
);


var commonValid = validMasks
  .select("common_valid_P1_P5")
  .unmask(0)
  .eq(1)
  .rename("common_valid");


// ======================================================================
// 6. 共同适用域
// ======================================================================

var commonAD = ee.Image(
  ASSET_ROOT +
  "/MP_PGDE_AD_COMMON_P1_P5_POOLED_V2_READY_1KM"
);


var adBroad = commonAD
  .select("common_AD_broad_P1_P5")
  .unmask(0)
  .eq(1)
  .and(commonValid)
  .rename("AD_broad");


var adRelaxed = commonAD
  .select("common_AD_relaxed_P1_P5")
  .unmask(0)
  .eq(1)
  .and(commonValid)
  .rename("AD_relaxed");


var adStrict = commonAD
  .select("common_AD_strict_P1_P5")
  .unmask(0)
  .eq(1)
  .and(commonValid)
  .rename("AD_strict");


// ======================================================================
// 7. 第16步共同可靠域
// ======================================================================

var reliability = ee.Image(
  ASSET_ROOT +
  "/MP_PGDE_RELIABILITY_COMMON_P1_P5_POOLED_V2_READY_FIXED_1KM"
);


var reliableStrict = reliability
  .select("common_reliable_strict_P1_P5")
  .unmask(0)
  .eq(1)
  .and(commonValid)
  .rename("reliable_strict");


var reliableNoEco = reliability
  .select("common_reliable_no_ecorisk_P1_P5")
  .unmask(0)
  .eq(1)
  .and(commonValid)
  .rename("reliable_noeco");


// ======================================================================
// 8. 核心区边缘代理
// ======================================================================
//
// 内部核心：3×3邻域均为核心。
// 边缘核心：核心像元中不属于内部核心的部分。
// focalMin为形态学最小值滤波，无需重新调用模型。

var interiorP1 = coreP1
  .unmask(0)
  .focalMin(
    1,
    "square",
    "pixels",
    1
  )
  .eq(1)
  .and(coreP1)
  .rename("interior_P1");


var interiorP5 = coreP5
  .unmask(0)
  .focalMin(
    1,
    "square",
    "pixels",
    1
  )
  .eq(1)
  .and(coreP5)
  .rename("interior_P5");


var edgeP1 = coreP1
  .and(interiorP1.not())
  .rename("edge_P1");


var edgeP5 = coreP5
  .and(interiorP5.not())
  .rename("edge_P5");


// ======================================================================
// 9. 构建面积和面积加权影像
// ======================================================================

var areaKm2 = ee.Image.pixelArea()
  .divide(1e6);


var aggregationImage = ee.Image.cat([

  // 有效面积。
  areaKm2
    .updateMask(commonValid)
    .rename("valid_area_km2"),


  // 面积加权PGDE。
  pgdeP1
    .multiply(areaKm2)
    .updateMask(commonValid)
    .rename("PGDE_P1_area_sum"),

  pgdeP5
    .multiply(areaKm2)
    .updateMask(commonValid)
    .rename("PGDE_P5_area_sum"),

  deltaPGDE
    .multiply(areaKm2)
    .updateMask(commonValid)
    .rename("Delta_PGDE_area_sum"),


  // 核心区面积。
  areaKm2
    .updateMask(coreP1.and(commonValid))
    .rename("core_area_P1_km2"),

  areaKm2
    .updateMask(coreP5.and(commonValid))
    .rename("core_area_P5_km2"),

  areaKm2
    .updateMask(stableCore.and(commonValid))
    .rename("stable_core_area_km2"),

  areaKm2
    .updateMask(coreLoss.and(commonValid))
    .rename("core_loss_area_km2"),

  areaKm2
    .updateMask(coreGain.and(commonValid))
    .rename("core_gain_area_km2"),


  // 内部与边缘。
  areaKm2
    .updateMask(interiorP1.and(commonValid))
    .rename("interior_area_P1_km2"),

  areaKm2
    .updateMask(interiorP5.and(commonValid))
    .rename("interior_area_P5_km2"),

  areaKm2
    .updateMask(edgeP1.and(commonValid))
    .rename("edge_area_P1_km2"),

  areaKm2
    .updateMask(edgeP5.and(commonValid))
    .rename("edge_area_P5_km2"),


  // 适用域和可靠域面积。
  areaKm2
    .updateMask(adBroad)
    .rename("AD_broad_area_km2"),

  areaKm2
    .updateMask(adRelaxed)
    .rename("AD_relaxed_area_km2"),

  areaKm2
    .updateMask(adStrict)
    .rename("AD_strict_area_km2"),

  areaKm2
    .updateMask(reliableStrict)
    .rename("reliable_strict_area_km2"),

  areaKm2
    .updateMask(reliableNoEco)
    .rename("reliable_noeco_area_km2")
]);


// ======================================================================
// 10. 网格汇总
// ======================================================================

var gridStats = aggregationImage.reduceRegions({
  collection: decouplingGrid,
  reducer: ee.Reducer.sum(),
  scale: SCALE,
  crs: CRS,
  tileScale: 8,
  maxPixelsPerRegion: 1e9
});


// ======================================================================
// 11. 添加比例和均值字段
// ======================================================================

function getNum(feature, name) {
  return ee.Number(
    ee.Algorithms.If(
      feature.get(name),
      feature.get(name),
      0
    )
  );
}


function safeDivide(numerator, denominator) {
  return ee.Number(
    ee.Algorithms.If(
      denominator.gt(0),
      numerator.divide(denominator),
      0
    )
  );
}


gridStats = gridStats.map(function(feature) {

  var validArea =
    getNum(feature, "valid_area_km2");

  var p1Core =
    getNum(feature, "core_area_P1_km2");

  var p5Core =
    getNum(feature, "core_area_P5_km2");

  var stable =
    getNum(feature, "stable_core_area_km2");

  var loss =
    getNum(feature, "core_loss_area_km2");

  var gain =
    getNum(feature, "core_gain_area_km2");

  var edge1 =
    getNum(feature, "edge_area_P1_km2");

  var edge5 =
    getNum(feature, "edge_area_P5_km2");

  var edgeFractionP1 =
    safeDivide(edge1, p1Core);

  var edgeFractionP5 =
    safeDivide(edge5, p5Core);


  return feature.set({

    PGDE_P1_mean:
      safeDivide(
        getNum(feature, "PGDE_P1_area_sum"),
        validArea
      ),

    PGDE_P5_mean:
      safeDivide(
        getNum(feature, "PGDE_P5_area_sum"),
        validArea
      ),

    PGDE_change:
      safeDivide(
        getNum(feature, "Delta_PGDE_area_sum"),
        validArea
      ),


    core_area_change_km2:
      p5Core.subtract(p1Core),

    core_frac_P1:
      safeDivide(p1Core, validArea),

    core_frac_P5:
      safeDivide(p5Core, validArea),

    core_stable_frac_total:
      safeDivide(stable, validArea),

    core_loss_frac_total:
      safeDivide(loss, validArea),

    core_gain_frac_total:
      safeDivide(gain, validArea),

    core_loss_frac_of_P1core:
      safeDivide(loss, p1Core),

    core_gain_frac_of_P5core:
      safeDivide(gain, p5Core),


    edge_frac_P1_of_core:
      edgeFractionP1,

    edge_frac_P5_of_core:
      edgeFractionP5,

    edge_frac_change:
      edgeFractionP5.subtract(
        edgeFractionP1
      ),


    AD_broad_fraction:
      safeDivide(
        getNum(feature, "AD_broad_area_km2"),
        validArea
      ),

    AD_relaxed_fraction:
      safeDivide(
        getNum(feature, "AD_relaxed_area_km2"),
        validArea
      ),

    AD_strict_fraction:
      safeDivide(
        getNum(feature, "AD_strict_area_km2"),
        validArea
      ),

    reliable_strict_fraction:
      safeDivide(
        getNum(feature, "reliable_strict_area_km2"),
        validArea
      ),

    reliable_noeco_fraction:
      safeDivide(
        getNum(feature, "reliable_noeco_area_km2"),
        validArea
      )
  });
});


print("Grid statistics count:", gridStats.size());
print("First grid statistics:", gridStats.first());


// ======================================================================
// 12. 导出Drive
// ======================================================================

Export.table.toDrive({
  collection: gridStats,
  description:
    "MP_grid_core_turnover_POOLED_V2_READY_t07",
  folder: DRIVE_FOLDER,
  fileNamePrefix:
    "MP_grid_core_turnover_POOLED_V2_READY_t07",
  fileFormat: "CSV"
});


print("Step 18 grid aggregation task created.");
