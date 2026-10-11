/**** 15_APPLICABILITY_DOMAIN_READY.js
 *
 * 使用READY训练记录构建模型适用域：
 * q01—q99为稳健训练环境范围。
 *
 *********************************************************************/


// ======================================================================
// 1. 基础设置
// ======================================================================

var MP = ee.FeatureCollection(
  "projects/YOUR_GEE_PROJECT/assets/MP"
);

var aoi = MP.geometry().simplify(1000);
var exportRegion = aoi.bounds(1000);

var ASSET_ROOT =
  "projects/YOUR_GEE_PROJECT/assets/menggu";

var TRAINING_ASSET =
  ASSET_ROOT +
  "/MP_PGDE_pooled_training_records_v2_READY";

var DRIVE_FOLDER =
  "MP_GDE_POOLED_V2_APPLICABILITY";

var EXPORT_CRS = "EPSG:4326";
var EXPORT_SCALE = 1000;


// ======================================================================
// 2. 模型变量与时期
// ======================================================================

var MODEL_BANDS = [
  "NDVI_mean",
  "NDVI_max",
  "NDVI_min",
  "NDVI_CV",
  "NDVI_retention",

  "ET_PET",

  "MNDWI_mean",
  "water_frequency",
  "dist_persistent_water",
  "dist_seasonal_water",

  "PDSI_mean",
  "precip_mean",
  "temp_mean",
  "Aridity_index",

  "elevation",
  "slope",
  "HAND",

  "forest_frac",
  "grass_shrub_frac",
  "cropland_frac",
  "built_frac",
  "bare_frac",
  "water_wetland_frac"
];


var PERIODS = [
  {
    id:
      "P1",

    label:
      "P1_2003_2007",

    predictor:
      ASSET_ROOT +
      "/MP_PREDICTORS_P1_2003_2007_POOLED_V2_1KM"
  },

  {
    id:
      "P2",

    label:
      "P2_2008_2011",

    predictor:
      ASSET_ROOT +
      "/MP_PREDICTORS_P2_2008_2011_POOLED_V2_1KM"
  },

  {
    id:
      "P3",

    label:
      "P3_2012_2015",

    predictor:
      ASSET_ROOT +
      "/MP_PREDICTORS_P3_2012_2015_POOLED_V2_1KM"
  },

  {
    id:
      "P4",

    label:
      "P4_2016_2019",

    predictor:
      ASSET_ROOT +
      "/MP_PREDICTORS_P4_2016_2019_POOLED_V2_1KM"
  },

  {
    id:
      "P5",

    label:
      "P5_2020_2024",

    predictor:
      ASSET_ROOT +
      "/MP_PREDICTORS_P5_2020_2024_POOLED_V2_1KM"
  }
];


// ======================================================================
// 3. 数值化训练表
// ======================================================================

function normalizeTrainingFeature(feature) {

  var parsed = ee.Dictionary({});


  MODEL_BANDS.forEach(function(bandName) {

    parsed = parsed.set(
      bandName,

      ee.Number.parse(
        ee.String(
          feature.get(bandName)
        )
      )
    );
  });


  return feature.set(parsed);
}


var training =
  ee.FeatureCollection(
    TRAINING_ASSET
  )
  .map(normalizeTrainingFeature)
  .filter(
    ee.Filter.notNull(
      MODEL_BANDS
    )
  );


print(
  "Training count:",
  training.size()
);


// ======================================================================
// 4. 计算每个变量训练环境范围
// ======================================================================

var BAND_STATS = {};
var rangeFeatures = [];


MODEL_BANDS.forEach(function(bandName) {

  var stats =
    training.reduceColumns({
      reducer:
        ee.Reducer.percentile([
          1,
          5,
          50,
          95,
          99
        ]),

      selectors: [
        bandName
      ]
    });


  var q01 =
    ee.Number(
      stats.get("p1")
    );

  var q05 =
    ee.Number(
      stats.get("p5")
    );

  var q50 =
    ee.Number(
      stats.get("p50")
    );

  var q95 =
    ee.Number(
      stats.get("p95")
    );

  var q99 =
    ee.Number(
      stats.get("p99")
    );


  BAND_STATS[bandName] = {
    q01:
      q01,

    q05:
      q05,

    q50:
      q50,

    q95:
      q95,

    q99:
      q99
  };


  rangeFeatures.push(
    ee.Feature(null, {
      variable:
        bandName,

      q01:
        q01,

      q05:
        q05,

      median:
        q50,

      q95:
        q95,

      q99:
        q99,

      envelope_width:
        q99.subtract(q01)
    })
  );
});


var rangeTable =
  ee.FeatureCollection(
    rangeFeatures
  );


print(
  "Training environmental ranges:",
  rangeTable
);


Export.table.toDrive({
  collection:
    rangeTable,

  description:
    "MP_PGDE_training_environment_ranges_READY_v2",

  folder:
    DRIVE_FOLDER,

  fileNamePrefix:
    "MP_PGDE_training_environment_ranges_READY_v2",

  fileFormat:
    "CSV"
});


Export.table.toAsset({
  collection:
    rangeTable,

  description:
    "ASSET_MP_PGDE_training_environment_ranges_READY_v2",

  assetId:
    ASSET_ROOT +
    "/MP_PGDE_training_environment_ranges_READY_v2"
});


// ======================================================================
// 5. 构建单期适用域
// ======================================================================

function buildApplicabilityDomain(
  predictorImage
) {

  predictorImage =
    predictorImage.select(
      MODEL_BANDS
    );


  var validMask =
    predictorImage
      .mask()
      .reduce(
        ee.Reducer.min()
      )
      .eq(1);


  var outsideImages = [];
  var exceedanceImages = [];


  MODEL_BANDS.forEach(function(bandName) {

    var band =
      predictorImage.select(
        bandName
      );


    var q01 =
      BAND_STATS[
        bandName
      ].q01;


    var q99 =
      BAND_STATS[
        bandName
      ].q99;


    var lower =
      ee.Image.constant(q01);


    var upper =
      ee.Image.constant(q99);


    var outside =
      band.lt(lower)
        .or(
          band.gt(upper)
        )
        .rename("outside")
        .toByte();


    var width =
      q99.subtract(q01)
        .abs()
        .max(0.000001);


    var lowerExceedance =
      lower.subtract(band)
        .max(0);


    var upperExceedance =
      band.subtract(upper)
        .max(0);


    var normalizedExceedance =
      lowerExceedance
        .max(
          upperExceedance
        )
        .divide(width)
        .rename("exceedance")
        .toFloat();


    outsideImages.push(
      outside
    );


    exceedanceImages.push(
      normalizedExceedance
    );
  });


  var outsideCollection =
    ee.ImageCollection.fromImages(
      outsideImages
    );


  var exceedanceCollection =
    ee.ImageCollection.fromImages(
      exceedanceImages
    );


  var outsideCount =
    outsideCollection
      .sum()
      .rename(
        "outside_count"
      )
      .toByte();


  var outsideFraction =
    outsideCount
      .divide(
        MODEL_BANDS.length
      )
      .rename(
        "outside_fraction"
      )
      .toFloat();


  var maximumExceedance =
    exceedanceCollection
      .max()
      .rename(
        "max_exceedance"
      )
      .toFloat();


  var meanExceedance =
    exceedanceCollection
      .mean()
      .rename(
        "mean_exceedance"
      )
      .toFloat();


  var adStrict =
    outsideCount.eq(0)
      .rename(
        "AD_strict"
      )
      .toByte();


  var adRelaxed =
    outsideCount.lte(1)
      .rename(
        "AD_relaxed"
      )
      .toByte();


  var adBroad =
    outsideCount.lte(2)
      .rename(
        "AD_broad"
      )
      .toByte();


  return outsideCount
    .addBands(
      outsideFraction
    )
    .addBands(
      maximumExceedance
    )
    .addBands(
      meanExceedance
    )
    .addBands(
      adStrict
    )
    .addBands(
      adRelaxed
    )
    .addBands(
      adBroad
    )
    .updateMask(
      validMask
    )
    .clip(aoi);
}


// ======================================================================
// 6. 五期适用域
// ======================================================================

var AD_RESULTS = {};


PERIODS.forEach(function(period) {

  var predictor =
    ee.Image(
      period.predictor
    );


  var ad =
    buildApplicabilityDomain(
      predictor
    );


  AD_RESULTS[period.id] =
    ad;


  var outputName =
    "MP_PGDE_AD_" +
    period.label +
    "_POOLED_V2_READY_Q01_Q99_1KM";


  Export.image.toAsset({
    image:
      ad,

    description:
      outputName,

    assetId:
      ASSET_ROOT +
      "/" +
      outputName,

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
        "mean",

      "outside_count":
        "mode",

      "AD_strict":
        "mode",

      "AD_relaxed":
        "mode",

      "AD_broad":
        "mode"
    }
  });
});


// ======================================================================
// 7. 共同适用域
// ======================================================================

function commonMask(
  bandName,
  outputName
) {

  return AD_RESULTS.P1
    .select(bandName)
    .eq(1)

    .and(
      AD_RESULTS.P5
        .select(bandName)
        .eq(1)
    )

    .rename(outputName)
    .toByte();
}


var commonStrictP1P5 =
  commonMask(
    "AD_strict",

    "common_AD_strict_P1_P5"
  );


var commonRelaxedP1P5 =
  commonMask(
    "AD_relaxed",

    "common_AD_relaxed_P1_P5"
  );


var commonBroadP1P5 =
  commonMask(
    "AD_broad",

    "common_AD_broad_P1_P5"
  );


var commonStrictAll5 =
  AD_RESULTS.P1
    .select("AD_strict")
    .eq(1)

    .and(
      AD_RESULTS.P2
        .select("AD_strict")
        .eq(1)
    )

    .and(
      AD_RESULTS.P3
        .select("AD_strict")
        .eq(1)
    )

    .and(
      AD_RESULTS.P4
        .select("AD_strict")
        .eq(1)
    )

    .and(
      AD_RESULTS.P5
        .select("AD_strict")
        .eq(1)
    )

    .rename(
      "common_AD_strict_all5"
    )
    .toByte();


var commonADStack =
  commonStrictP1P5
    .addBands(
      commonRelaxedP1P5
    )
    .addBands(
      commonBroadP1P5
    )
    .addBands(
      commonStrictAll5
    );


Export.image.toAsset({
  image:
    commonADStack,

  description:
    "ASSET_MP_PGDE_AD_COMMON_P1_P5_POOLED_V2_READY_1KM",

  assetId:
    ASSET_ROOT +
    "/MP_PGDE_AD_COMMON_P1_P5_POOLED_V2_READY_1KM",

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
// 8. 面积汇总
// ======================================================================

var areaKm2 =
  ee.Image.pixelArea()
    .divide(1e6)
    .rename("area_km2");


function areaOf(mask) {

  var result =
    areaKm2
      .updateMask(
        mask.eq(1)
      )
      .reduceRegion({
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


  return ee.Number(
    ee.Algorithms.If(
      result.contains(
        "area_km2"
      ),

      result.get(
        "area_km2"
      ),

      0
    )
  );
}


var areaSummary =
  ee.FeatureCollection([
    ee.Feature(null, {
      zone:
        "common_AD_strict_P1_P5",

      area_km2:
        areaOf(
          commonStrictP1P5
        )
    }),

    ee.Feature(null, {
      zone:
        "common_AD_relaxed_P1_P5",

      area_km2:
        areaOf(
          commonRelaxedP1P5
        )
    }),

    ee.Feature(null, {
      zone:
        "common_AD_broad_P1_P5",

      area_km2:
        areaOf(
          commonBroadP1P5
        )
    }),

    ee.Feature(null, {
      zone:
        "common_AD_strict_all5",

      area_km2:
        areaOf(
          commonStrictAll5
        )
    })
  ]);


Export.table.toDrive({
  collection:
    areaSummary,

  description:
    "MP_PGDE_applicability_domain_area_summary_READY_v2",

  folder:
    DRIVE_FOLDER,

  fileNamePrefix:
    "MP_PGDE_applicability_domain_area_summary_READY_v2",

  fileFormat:
    "CSV"
});


// ======================================================================
// 9. 地图
// ======================================================================

Map.centerObject(MP, 4);


Map.addLayer(
  AD_RESULTS.P5
    .select(
      "outside_count"
    ),

  {
    min:
      0,

    max:
      5,

    palette: [
      "006837",
      "ffffbf",
      "fdae61",
      "f46d43",
      "a50026"
    ]
  },

  "P5 outside variable count"
);


Map.addLayer(
  commonStrictP1P5
    .selfMask(),

  {
    palette: [
      "006837"
    ]
  },

  "Common strict AD P1-P5",

  false
);


print(
  "15 applicability-domain tasks created."
);
