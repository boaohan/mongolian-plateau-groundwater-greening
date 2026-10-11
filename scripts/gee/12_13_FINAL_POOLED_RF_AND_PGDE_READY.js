/**** 12_13_FINAL_POOLED_RF_AND_PGDE_READY.js
 *
 * 使用全部14,970条READY训练记录：
 * 1. 训练一个统一pooled Random Forest；
 * 2. 用同一模型预测P1—P5；
 * 3. period_id、年份、retention_valid不进入模型；
 * 4. 不执行0.25、0.20、0.10经验降权；
 * 5. 保留NoData掩膜，不将缺失像元设为PGDE=0。
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
  "MP_GDE_POOLED_V2_FINAL_PGDE";

var EXPORT_CRS = "EPSG:4326";
var EXPORT_SCALE = 1000;

var EXPORT_TO_ASSET = true;
var EXPORT_TO_DRIVE = false;

var NODATA = -9999;


// ======================================================================
// 2. 冻结的最终RF参数
// ======================================================================

var RF_NUMBER_OF_TREES = 500;
var RF_MIN_LEAF_POPULATION = 5;
var RF_BAG_FRACTION = 0.7;
var RF_SEED = 20260722;


// ======================================================================
// 3. 最终模型变量
// ======================================================================

// 明确排除：
// retention_valid
// period_id
// period_index
// midpoint_year
// fold5、fold10
// lon、lat

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


// ======================================================================
// 4. 五期预测变量资产
// ======================================================================

var PERIODS = [
  {
    id: "P1",
    label: "P1_2003_2007",
    midpoint: 2005.0,
    predictor:
      ASSET_ROOT +
      "/MP_PREDICTORS_P1_2003_2007_POOLED_V2_1KM"
  },
  {
    id: "P2",
    label: "P2_2008_2011",
    midpoint: 2009.5,
    predictor:
      ASSET_ROOT +
      "/MP_PREDICTORS_P2_2008_2011_POOLED_V2_1KM"
  },
  {
    id: "P3",
    label: "P3_2012_2015",
    midpoint: 2013.5,
    predictor:
      ASSET_ROOT +
      "/MP_PREDICTORS_P3_2012_2015_POOLED_V2_1KM"
  },
  {
    id: "P4",
    label: "P4_2016_2019",
    midpoint: 2017.5,
    predictor:
      ASSET_ROOT +
      "/MP_PREDICTORS_P4_2016_2019_POOLED_V2_1KM"
  },
  {
    id: "P5",
    label: "P5_2020_2024",
    midpoint: 2022.0,
    predictor:
      ASSET_ROOT +
      "/MP_PREDICTORS_P5_2020_2024_POOLED_V2_1KM"
  }
];


// ======================================================================
// 5. 将CSV属性统一转换为数值
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

  parsed = parsed.set(
    "class_num",
    ee.Number.parse(
      ee.String(
        feature.get("class")
      )
    )
  );

  return feature.set(parsed);
}


var trainingRaw = ee.FeatureCollection(
  TRAINING_ASSET
);

var training = trainingRaw
  .map(normalizeTrainingFeature)
  .filter(
    ee.Filter.notNull(
      MODEL_BANDS.concat([
        "class_num"
      ])
    )
  );


var classOrder = ee.List(
  training.aggregate_array(
    "class_num"
  )
)
.distinct()
.sort();


print(
  "Raw training count:",
  trainingRaw.size()
);

print(
  "Valid training count, expected 14970:",
  training.size()
);

print(
  "Class histogram, expected 0=7470, 1=7500:",
  training.aggregate_histogram(
    "class_num"
  )
);

print(
  "Period histogram:",
  training.aggregate_histogram(
    "period_id"
  )
);

print(
  "Class order must be [0, 1]:",
  classOrder
);


// ======================================================================
// 6. 训练最终统一RF
// ======================================================================

var rfProbability =
  ee.Classifier.smileRandomForest({
    numberOfTrees:
      RF_NUMBER_OF_TREES,

    variablesPerSplit:
      null,

    minLeafPopulation:
      RF_MIN_LEAF_POPULATION,

    bagFraction:
      RF_BAG_FRACTION,

    seed:
      RF_SEED
  })

  .setOutputMode(
    "MULTIPROBABILITY"
  )

  .train({
    features:
      training,

    classProperty:
      "class_num",

    inputProperties:
      MODEL_BANDS
  });


var rfClassification =
  ee.Classifier.smileRandomForest({
    numberOfTrees:
      RF_NUMBER_OF_TREES,

    variablesPerSplit:
      null,

    minLeafPopulation:
      RF_MIN_LEAF_POPULATION,

    bagFraction:
      RF_BAG_FRACTION,

    seed:
      RF_SEED
  })

  .train({
    features:
      training,

    classProperty:
      "class_num",

    inputProperties:
      MODEL_BANDS
  });


print(
  "Final RF explanation:",
  rfClassification.explain()
);


// ======================================================================
// 7. 单期预测
// ======================================================================

function predictPeriod(period) {

  var predictors = ee.Image(
    period.predictor
  ).select(
    MODEL_BANDS
  );


  var validMask = predictors
    .mask()
    .reduce(
      ee.Reducer.min()
    )
    .eq(1)
    .rename(
      "valid_" + period.id
    );


  var probabilityArray =
    predictors.classify(
      rfProbability,
      "probability_array"
    );


  // 已在控制台确认类别顺序为[0,1]。
  var probabilityImage =
    probabilityArray.arrayFlatten([
      [
        "P_NonGDE",
        "P_GDE"
      ]
    ]);


  var pgde = probabilityImage
    .select("P_GDE")
    .rename(
      "PGDE_" + period.id
    )
    .updateMask(validMask)
    .clip(aoi)
    .clamp(0, 1)
    .toFloat()
    .set({
      period_id:
        period.id,

      period_label:
        period.label,

      midpoint_year:
        period.midpoint,

      model_version:
        "pooled_v2_READY_final",

      training_records:
        14970,

      number_of_trees:
        RF_NUMBER_OF_TREES,

      min_leaf_population:
        RF_MIN_LEAF_POPULATION,

      bag_fraction:
        RF_BAG_FRACTION,

      seed:
        RF_SEED
    });


  var hardClass = predictors
    .classify(
      rfClassification
    )
    .rename(
      "RF_class_" + period.id
    )
    .updateMask(validMask)
    .clip(aoi)
    .toByte();


  return {
    pgde:
      pgde,

    hardClass:
      hardClass,

    validMask:
      validMask
  };
}


// ======================================================================
// 8. 导出函数
// ======================================================================

function exportPGDEToAsset(
  image,
  period
) {

  var outputName =
    "MP_PGDE_" +
    period.label +
    "_POOLED_V2_READY_RAW_1KM";


  Export.image.toAsset({
    image:
      image,

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
        "mean"
    }
  });
}


function exportPGDEToDrive(
  image,
  period
) {

  var outputName =
    "MP_PGDE_" +
    period.label +
    "_POOLED_V2_READY_RAW_1KM";


  Export.image.toDrive({
    image:
      image.unmask({
        value:
          NODATA,

        sameFootprint:
          false
      }),

    description:
      outputName,

    folder:
      DRIVE_FOLDER,

    fileNamePrefix:
      outputName,

    region:
      exportRegion,

    crs:
      EXPORT_CRS,

    scale:
      EXPORT_SCALE,

    maxPixels:
      1e13,

    shardSize:
      256,

    fileDimensions:
      8192,

    skipEmptyTiles:
      true,

    fileFormat:
      "GeoTIFF",

    formatOptions: {
      cloudOptimized:
        true,

      noData:
        NODATA
    }
  });
}


// ======================================================================
// 9. 预测五期
// ======================================================================

var RESULTS = {};

var pgdeStack = ee.Image.constant(0)
  .rename("dummy")
  .select([]);

var hardClassStack =
  ee.Image.constant(0)
    .rename("dummy")
    .select([]);

var validStack =
  ee.Image.constant(0)
    .rename("dummy")
    .select([]);

var summaryFeatures = [];

var areaKm2 = ee.Image.pixelArea()
  .divide(1e6)
  .rename("area_km2");


PERIODS.forEach(function(period) {

  var result =
    predictPeriod(period);

  RESULTS[period.id] =
    result;


  pgdeStack = pgdeStack
    .addBands(
      result.pgde
    );


  hardClassStack =
    hardClassStack.addBands(
      result.hardClass
    );


  validStack = validStack
    .addBands(
      result.validMask.toByte()
    );


  var validArea = ee.Number(
    areaKm2
      .updateMask(
        result.validMask
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
      })
      .get("area_km2")
  );


  var meanPGDE = ee.Number(
    result.pgde.reduceRegion({
      reducer:
        ee.Reducer.mean(),

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
    }).get(
      "PGDE_" + period.id
    )
  );


  var areaPGDE05 = ee.Number(
    areaKm2
      .updateMask(
        result.pgde.gte(0.5)
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
      })
      .get("area_km2")
  );


  var areaPGDE07 = ee.Number(
    areaKm2
      .updateMask(
        result.pgde.gte(0.7)
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
      })
      .get("area_km2")
  );


  summaryFeatures.push(
    ee.Feature(null, {
      period_id:
        period.id,

      period_label:
        period.label,

      midpoint_year:
        period.midpoint,

      valid_area_km2:
        validArea,

      mean_PGDE:
        meanPGDE,

      area_PGDE_ge_0p5_km2:
        areaPGDE05,

      core_area_PGDE_ge_0p7_km2:
        areaPGDE07
    })
  );


  if (EXPORT_TO_ASSET) {

    exportPGDEToAsset(
      result.pgde,
      period
    );
  }


  if (EXPORT_TO_DRIVE) {

    exportPGDEToDrive(
      result.pgde,
      period
    );
  }
});


// ======================================================================
// 10. 共同有效域
// ======================================================================

var commonValidAll5 =
  validStack
    .reduce(
      ee.Reducer.min()
    )
    .rename(
      "common_valid_all5"
    )
    .toByte();


var commonValidP1P5 =
  validStack
    .select([
      "valid_P1",
      "valid_P5"
    ])
    .reduce(
      ee.Reducer.min()
    )
    .rename(
      "common_valid_P1_P5"
    )
    .toByte();


var summary =
  ee.FeatureCollection(
    summaryFeatures
  );


print(
  "Five-period PGDE summary:",
  summary
);

print(
  "PGDE stack bands:",
  pgdeStack.bandNames()
);


// ======================================================================
// 11. 导出stack、有效域和汇总表
// ======================================================================

Export.image.toAsset({
  image:
    pgdeStack,

  description:
    "ASSET_MP_PGDE_STACK_P1_P5_POOLED_V2_READY_RAW_1KM",

  assetId:
    ASSET_ROOT +
    "/MP_PGDE_STACK_P1_P5_POOLED_V2_READY_RAW_1KM",

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
      "mean"
  }
});


Export.image.toAsset({
  image:
    validStack
      .addBands(
        commonValidAll5
      )
      .addBands(
        commonValidP1P5
      ),

  description:
    "ASSET_MP_PGDE_VALID_MASKS_POOLED_V2_READY",

  assetId:
    ASSET_ROOT +
    "/MP_PGDE_VALID_MASKS_POOLED_V2_READY",

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


Export.image.toAsset({
  image:
    hardClassStack,

  description:
    "ASSET_MP_PGDE_RF_CLASS_STACK_POOLED_V2_READY_1KM",

  assetId:
    ASSET_ROOT +
    "/MP_PGDE_RF_CLASS_STACK_POOLED_V2_READY_1KM",

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


Export.table.toDrive({
  collection:
    summary,

  description:
    "MP_PGDE_summary_by_period_pooled_v2_READY",

  folder:
    DRIVE_FOLDER,

  fileNamePrefix:
    "MP_PGDE_summary_by_period_pooled_v2_READY",

  fileFormat:
    "CSV"
});


// ======================================================================
// 12. 地图预览
// ======================================================================

Map.centerObject(MP, 4);

var pgdeVis = {
  min:
    0,

  max:
    1,

  palette: [
    "f7f7f7",
    "d9f0a3",
    "78c679",
    "238443",
    "005a32",
    "54278f"
  ]
};


Map.addLayer(
  RESULTS.P1.pgde,
  pgdeVis,
  "P1 final PGDE"
);


Map.addLayer(
  RESULTS.P5.pgde,
  pgdeVis,
  "P5 final PGDE"
);


Map.addLayer(
  RESULTS.P5.pgde
    .subtract(
      RESULTS.P1.pgde
    )
    .updateMask(
      commonValidP1P5
    ),

  {
    min:
      -0.3,

    max:
      0.3,

    palette: [
      "8c510a",
      "d8b365",
      "f6e8c3",
      "ffffff",
      "c7eae5",
      "5ab4ac",
      "01665e"
    ]
  },

  "Preliminary P5-P1 PGDE change",

  false
);


print(
  "12-13 final PGDE tasks created."
);
