/**** 19_CONSERVATIVE_POST_WEIGHT_SENSITIVITY.js
 *
 * 只补充旧人工降权情景。
 *
 * 主模型仍使用未经降权的raw PGDE。
 * 本结果只能作为conservative sensitivity scenario。
 *
 *********************************************************************/


// ======================================================================
// 1. 设置
// ======================================================================

var MP = ee.FeatureCollection(
  "projects/YOUR_GEE_PROJECT/assets/MP"
);

var aoi = MP.geometry();

var ASSET_ROOT =
  "projects/YOUR_GEE_PROJECT/assets/menggu";

var DRIVE_FOLDER =
  "MP_GDE_POOLED_V2_SENSITIVITY";

var SCALE = 1000;
var CRS = "EPSG:4326";


// ======================================================================
// 2. PGDE和Predictor
// ======================================================================

var pgdeP1 = ee.Image(
  ASSET_ROOT +
  "/MP_PGDE_P1_2003_2007_POOLED_V2_READY_RAW_1KM"
).select(0).rename("PGDE");


var pgdeP5 = ee.Image(
  ASSET_ROOT +
  "/MP_PGDE_P5_2020_2024_POOLED_V2_READY_RAW_1KM"
).select(0).rename("PGDE");


var predictorP1 = ee.Image(
  ASSET_ROOT +
  "/MP_PREDICTORS_P1_2003_2007_POOLED_V2_1KM"
);


var predictorP5 = ee.Image(
  ASSET_ROOT +
  "/MP_PREDICTORS_P5_2020_2024_POOLED_V2_1KM"
);


// ======================================================================
// 3. 共同有效域和适用域
// ======================================================================

var validMasks = ee.Image(
  ASSET_ROOT +
  "/MP_PGDE_VALID_MASKS_POOLED_V2_READY"
);


var commonValid = validMasks
  .select("common_valid_P1_P5")
  .unmask(0)
  .eq(1);


var commonAD = ee.Image(
  ASSET_ROOT +
  "/MP_PGDE_AD_COMMON_P1_P5_POOLED_V2_READY_1KM"
);


var adBroad = commonAD
  .select("common_AD_broad_P1_P5")
  .unmask(0)
  .eq(1);


var adRelaxed = commonAD
  .select("common_AD_relaxed_P1_P5")
  .unmask(0)
  .eq(1);


// ======================================================================
// 4. 保守后处理函数
// ======================================================================

function applyConservativeWeights(
  pgde,
  predictor
) {

  var nearWater = predictor
    .select("dist_persistent_water")
    .lt(3000)

    .or(
      predictor
        .select("dist_seasonal_water")
        .lt(3000)
    )

    .or(
      predictor
        .select("water_frequency")
        .gt(0.20)
    );


  var wetClimate = predictor
    .select("Aridity_index")
    .gte(0.50)

    .or(
      predictor
        .select("PDSI_mean")
        .gte(0)
    );


  var wetFar = wetClimate
    .and(nearWater.not());


  var forestFar = predictor
    .select("forest_frac")
    .gt(0.50)

    .and(nearWater.not());


  var cropland = predictor
    .select("cropland_frac")
    .gt(0.50);


  return pgde

    .where(
      wetFar,
      pgde.multiply(0.25)
    )

    .where(
      forestFar,
      pgde.multiply(0.20)
    )

    .where(
      cropland,
      pgde.multiply(0.10)
    )

    .rename("PGDE_conservative")

    .updateMask(
      pgde.mask()
    )

    .clamp(0, 1)

    .toFloat();
}


var conservativeP1 =
  applyConservativeWeights(
    pgdeP1,
    predictorP1
  );


var conservativeP5 =
  applyConservativeWeights(
    pgdeP5,
    predictorP5
  );


// ======================================================================
// 5. 场景
// ======================================================================

var DOMAINS = [
  {
    name: "common_valid",
    mask: commonValid
  },
  {
    name: "AD_broad",
    mask: adBroad
  },
  {
    name: "AD_relaxed",
    mask: adRelaxed
  }
];


var THRESHOLDS = [
  0.6,
  0.7,
  0.8
];


var areaKm2 = ee.Image.pixelArea()
  .divide(1e6);


function getNum(dictionary, name) {

  dictionary = ee.Dictionary(
    dictionary
  );

  return ee.Number(
    ee.Algorithms.If(
      dictionary.contains(name),
      dictionary.get(name),
      0
    )
  );
}


function safeDivide(a, b) {

  return ee.Number(
    ee.Algorithms.If(
      ee.Number(b).gt(0),
      ee.Number(a).divide(b),
      0
    )
  );
}


function calculateScenario(
  domain,
  threshold
) {

  var mask = domain.mask
    .unmask(0)
    .eq(1);


  var coreP1 = conservativeP1
    .gte(threshold)
    .and(mask);


  var coreP5 = conservativeP5
    .gte(threshold)
    .and(mask);


  var stable = coreP1
    .and(coreP5);


  var loss = coreP1
    .and(coreP5.not())
    .and(mask);


  var gain = coreP1.not()
    .and(coreP5)
    .and(mask);


  var union = coreP1
    .or(coreP5)
    .and(mask);


  var areaStack = ee.Image.cat([

    areaKm2
      .updateMask(mask)
      .rename("domain_area"),

    areaKm2
      .updateMask(coreP1)
      .rename("P1_area"),

    areaKm2
      .updateMask(coreP5)
      .rename("P5_area"),

    areaKm2
      .updateMask(stable)
      .rename("stable_area"),

    areaKm2
      .updateMask(loss)
      .rename("loss_area"),

    areaKm2
      .updateMask(gain)
      .rename("gain_area"),

    areaKm2
      .updateMask(union)
      .rename("union_area")
  ]);


  var stats = areaStack.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: aoi,
    scale: SCALE,
    crs: CRS,
    maxPixels: 1e13,
    tileScale: 8
  });


  var p1 = getNum(stats, "P1_area");
  var p5 = getNum(stats, "P5_area");
  var stableArea = getNum(stats, "stable_area");
  var lossArea = getNum(stats, "loss_area");
  var gainArea = getNum(stats, "gain_area");
  var unionArea = getNum(stats, "union_area");


  return ee.Feature(null, {

    scenario:
      "conservative_post_weight",

    analysis_domain:
      domain.name,

    core_threshold:
      threshold,

    domain_area_km2:
      getNum(stats, "domain_area"),

    P1_core_area_km2:
      p1,

    P5_core_area_km2:
      p5,

    core_net_change_km2:
      p5.subtract(p1),

    core_net_change_percent_of_P1:
      safeDivide(
        p5.subtract(p1),
        p1
      ).multiply(100),

    stable_core_area_km2:
      stableArea,

    core_loss_area_km2:
      lossArea,

    core_gain_area_km2:
      gainArea,

    gross_turnover_area_km2:
      lossArea.add(gainArea),

    P1_core_loss_percent:
      safeDivide(
        lossArea,
        p1
      ).multiply(100),

    turnover_percent_of_union:
      safeDivide(
        lossArea.add(gainArea),
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
// 6. 构建结果表
// ======================================================================

var features = [];


DOMAINS.forEach(function(domain) {

  THRESHOLDS.forEach(
    function(threshold) {

      features.push(
        calculateScenario(
          domain,
          threshold
        )
      );
    }
  );
});


var summary =
  ee.FeatureCollection(features);


print(
  "Conservative sensitivity scenarios:",
  summary.size()
);


Export.table.toDrive({
  collection: summary,
  description:
    "MP_GDE_core_turnover_conservative_weight_sensitivity",
  folder: DRIVE_FOLDER,
  fileNamePrefix:
    "MP_GDE_core_turnover_conservative_weight_sensitivity",
  fileFormat: "CSV"
});


print("Step 19 task created.");
