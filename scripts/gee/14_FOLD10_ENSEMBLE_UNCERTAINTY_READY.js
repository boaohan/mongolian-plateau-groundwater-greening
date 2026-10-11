/**** 14_FOLD10_ENSEMBLE_UNCERTAINTY_READY.js
 *
 * 对fold10=0—9分别训练删除一个空间fold的RF：
 * - 模型k排除fold10=k；
 * - 参数不再调优；
 * - 对五期分别预测；
 * - 计算mean、SD、range和核心投票；
 * - 计算P5-P1变化不确定性。
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

var EXPORT_CRS = "EPSG:4326";
var EXPORT_SCALE = 1000;

var RF_NUMBER_OF_TREES = 500;
var RF_MIN_LEAF_POPULATION = 5;
var RF_BAG_FRACTION = 0.7;
var RF_SEED = 20260722;

var CORE_THRESHOLD = 0.7;


// ======================================================================
// 2. 模型变量
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
      "/MP_PREDICTORS_P1_2003_2007_POOLED_V2_1KM",

    fullPGDE:
      ASSET_ROOT +
      "/MP_PGDE_P1_2003_2007_POOLED_V2_READY_RAW_1KM"
  },

  {
    id:
      "P2",

    label:
      "P2_2008_2011",

    predictor:
      ASSET_ROOT +
      "/MP_PREDICTORS_P2_2008_2011_POOLED_V2_1KM",

    fullPGDE:
      ASSET_ROOT +
      "/MP_PGDE_P2_2008_2011_POOLED_V2_READY_RAW_1KM"
  },

  {
    id:
      "P3",

    label:
      "P3_2012_2015",

    predictor:
      ASSET_ROOT +
      "/MP_PREDICTORS_P3_2012_2015_POOLED_V2_1KM",

    fullPGDE:
      ASSET_ROOT +
      "/MP_PGDE_P3_2012_2015_POOLED_V2_READY_RAW_1KM"
  },

  {
    id:
      "P4",

    label:
      "P4_2016_2019",

    predictor:
      ASSET_ROOT +
      "/MP_PREDICTORS_P4_2016_2019_POOLED_V2_1KM",

    fullPGDE:
      ASSET_ROOT +
      "/MP_PGDE_P4_2016_2019_POOLED_V2_READY_RAW_1KM"
  },

  {
    id:
      "P5",

    label:
      "P5_2020_2024",

    predictor:
      ASSET_ROOT +
      "/MP_PREDICTORS_P5_2020_2024_POOLED_V2_1KM",

    fullPGDE:
      ASSET_ROOT +
      "/MP_PGDE_P5_2020_2024_POOLED_V2_READY_RAW_1KM"
  }
];


// ======================================================================
// 3. 训练数据数值化
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


  parsed = parsed
    .set(
      "class_num",

      ee.Number.parse(
        ee.String(
          feature.get("class")
        )
      )
    )

    .set(
      "fold10_num",

      ee.Number.parse(
        ee.String(
          feature.get("fold10")
        )
      )
    );


  return feature.set(parsed);
}


var training = ee.FeatureCollection(
  TRAINING_ASSET
)
.map(normalizeTrainingFeature)
.filter(
  ee.Filter.notNull(
    MODEL_BANDS.concat([
      "class_num",
      "fold10_num"
    ])
  )
);


print(
  "Training count:",
  training.size()
);

print(
  "Fold10 histogram:",
  training.aggregate_histogram(
    "fold10_num"
  )
);


// ======================================================================
// 4. Predictor与完整模型PGDE
// ======================================================================

var PREDICTORS = {};
var FULL_PGDE = {};

PERIODS.forEach(function(period) {

  PREDICTORS[period.id] =
    ee.Image(
      period.predictor
    ).select(
      MODEL_BANDS
    );


  FULL_PGDE[period.id] =
    ee.Image(
      period.fullPGDE
    ).select(0)
      .rename("full_model_PGDE");
});


// ======================================================================
// 5. 训练10个删除空间fold的模型
// ======================================================================

var FOLD_MODELS = [];


for (
  var fold = 0;
  fold < 10;
  fold++
) {

  var foldTraining =
    training.filter(
      ee.Filter.neq(
        "fold10_num",
        fold
      )
    );


  print(
    "Training records after excluding fold " +
    fold + ":",

    foldTraining.size()
  );


  var model =
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
        RF_SEED + fold
    })

    .setOutputMode(
      "MULTIPROBABILITY"
    )

    .train({
      features:
        foldTraining,

      classProperty:
        "class_num",

      inputProperties:
        MODEL_BANDS
    });


  FOLD_MODELS.push(model);
}


// ======================================================================
// 6. 子模型预测函数
// ======================================================================

function predictWithModel(
  predictorImage,
  classifier
) {

  var validMask = predictorImage
    .mask()
    .reduce(
      ee.Reducer.min()
    )
    .eq(1);


  var probabilityArray =
    predictorImage.classify(
      classifier,
      "probability_array"
    );


  return probabilityArray
    .arrayFlatten([
      [
        "P_NonGDE",
        "P_GDE"
      ]
    ])
    .select("P_GDE")
    .rename("PGDE")
    .updateMask(validMask)
    .clip(aoi)
    .clamp(0, 1)
    .toFloat();
}


// ======================================================================
// 7. 收集各期10张预测图
// ======================================================================

var PREDICTION_LISTS = {
  P1:
    [],

  P2:
    [],

  P3:
    [],

  P4:
    [],

  P5:
    []
};


var DELTA_LIST = [];


for (
  var modelIndex = 0;
  modelIndex < 10;
  modelIndex++
) {

  var foldPrediction = {};


  PERIODS.forEach(function(period) {

    var prediction =
      predictWithModel(
        PREDICTORS[period.id],
        FOLD_MODELS[modelIndex]
      );


    foldPrediction[period.id] =
      prediction;


    PREDICTION_LISTS[period.id]
      .push(prediction);
  });


  var delta =
    foldPrediction.P5
      .subtract(
        foldPrediction.P1
      )
      .rename("Delta_PGDE")
      .toFloat();


  DELTA_LIST.push(delta);
}


// ======================================================================
// 8. 单期ensemble汇总
// ======================================================================

function summarizeEnsemble(
  imageList,
  fullModelPGDE
) {

  var collection =
    ee.ImageCollection.fromImages(
      imageList
    );


  var ensembleMean =
    collection.mean()
      .rename(
        "PGDE_ensemble_mean"
      );


  var ensembleSd =
    collection
      .reduce(
        ee.Reducer.stdDev()
      )
      .rename(
        "PGDE_ensemble_sd"
      );


  var ensembleMin =
    collection.min()
      .rename(
        "PGDE_ensemble_min"
      );


  var ensembleMax =
    collection.max()
      .rename(
        "PGDE_ensemble_max"
      );


  var ensembleRange =
    ensembleMax
      .subtract(ensembleMin)
      .rename(
        "PGDE_ensemble_range"
      );


  var coreVote =
    collection.map(
      function(image) {

        return image
          .gte(CORE_THRESHOLD)
          .rename("core_vote");
      }
    )
    .mean()
    .rename(
      "core_vote_0p7"
    );


  var positiveVote =
    collection.map(
      function(image) {

        return image
          .gte(0.5)
          .rename("positive_vote");
      }
    )
    .mean()
    .rename(
      "positive_vote_0p5"
    );


  var modelCount =
    collection.count()
      .rename(
        "ensemble_model_count"
      );


  var fullMinusEnsemble =
    fullModelPGDE
      .subtract(ensembleMean)
      .rename(
        "full_minus_ensemble_mean"
      );


  return ensembleMean
    .addBands(ensembleSd)
    .addBands(ensembleMin)
    .addBands(ensembleMax)
    .addBands(ensembleRange)
    .addBands(coreVote)
    .addBands(positiveVote)
    .addBands(modelCount)
    .addBands(fullMinusEnsemble)
    .toFloat();
}


// ======================================================================
// 9. 导出五期不确定性
// ======================================================================

var UNCERTAINTY_RESULTS = {};


PERIODS.forEach(function(period) {

  var uncertainty =
    summarizeEnsemble(
      PREDICTION_LISTS[
        period.id
      ],

      FULL_PGDE[
        period.id
      ]
    );


  UNCERTAINTY_RESULTS[
    period.id
  ] = uncertainty;


  var outputName =
    "MP_PGDE_UNCERTAINTY_" +
    period.label +
    "_POOLED_V2_READY_FOLD10_1KM";


  Export.image.toAsset({
    image:
      uncertainty,

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
});


// ======================================================================
// 10. P5-P1变化不确定性
// ======================================================================

var deltaCollection =
  ee.ImageCollection.fromImages(
    DELTA_LIST
  );


var deltaMean =
  deltaCollection.mean()
    .rename(
      "Delta_PGDE_ensemble_mean"
    );


var deltaSd =
  deltaCollection
    .reduce(
      ee.Reducer.stdDev()
    )
    .rename(
      "Delta_PGDE_ensemble_sd"
    );


var deltaMin =
  deltaCollection.min()
    .rename(
      "Delta_PGDE_ensemble_min"
    );


var deltaMax =
  deltaCollection.max()
    .rename(
      "Delta_PGDE_ensemble_max"
    );


var deltaRange =
  deltaMax
    .subtract(deltaMin)
    .rename(
      "Delta_PGDE_ensemble_range"
    );


var declineVote =
  deltaCollection.map(
    function(image) {

      return image
        .lt(-0.1)
        .rename("decline_vote");
    }
  )
  .mean()
  .rename(
    "decline_vote_lt_minus_0p1"
  );


var negativeVote =
  deltaCollection.map(
    function(image) {

      return image
        .lt(0)
        .rename("negative_vote");
    }
  )
  .mean()
  .rename(
    "negative_change_vote"
  );


var positiveChangeVote =
  deltaCollection.map(
    function(image) {

      return image
        .gt(0)
        .rename("positive_change_vote");
    }
  )
  .mean()
  .rename(
    "positive_change_vote"
  );


var signAgreement =
  negativeVote
    .max(
      positiveChangeVote
    )
    .rename(
      "change_sign_agreement"
    );


var robustDecline =
  declineVote
    .gte(0.8)
    .rename(
      "robust_decline_vote_ge_0p8"
    )
    .toByte();


var robustIncrease =
  positiveChangeVote
    .gte(0.8)
    .and(
      deltaMean.gt(0.1)
    )
    .rename(
      "robust_increase_vote_ge_0p8"
    )
    .toByte();


var deltaStack =
  deltaMean
    .addBands(deltaSd)
    .addBands(deltaMin)
    .addBands(deltaMax)
    .addBands(deltaRange)
    .addBands(declineVote)
    .addBands(negativeVote)
    .addBands(positiveChangeVote)
    .addBands(signAgreement)
    .addBands(robustDecline)
    .addBands(robustIncrease);


Export.image.toAsset({
  image:
    deltaStack,

  description:
    "ASSET_MP_DELTA_PGDE_UNCERTAINTY_P5_P1_POOLED_V2_READY_FOLD10_1KM",

  assetId:
    ASSET_ROOT +
    "/MP_DELTA_PGDE_UNCERTAINTY_P5_P1_POOLED_V2_READY_FOLD10_1KM",

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

    "robust_decline_vote_ge_0p8":
      "mode",

    "robust_increase_vote_ge_0p8":
      "mode"
  }
});


// ======================================================================
// 11. 地图预览
// ======================================================================

Map.centerObject(MP, 4);


Map.addLayer(
  UNCERTAINTY_RESULTS.P5
    .select(
      "PGDE_ensemble_sd"
    ),

  {
    min:
      0,

    max:
      0.15,

    palette: [
      "ffffff",
      "fee08b",
      "f46d43",
      "a50026"
    ]
  },

  "P5 ensemble SD"
);


Map.addLayer(
  UNCERTAINTY_RESULTS.P5
    .select(
      "core_vote_0p7"
    ),

  {
    min:
      0,

    max:
      1,

    palette: [
      "a50026",
      "ffffbf",
      "006837"
    ]
  },

  "P5 core vote"
);


Map.addLayer(
  deltaStack.select(
    "change_sign_agreement"
  ),

  {
    min:
      0.5,

    max:
      1,

    palette: [
      "a50026",
      "ffffbf",
      "006837"
    ]
  },

  "P1-P5 change sign agreement",

  false
);


print(
  "14 fold10 uncertainty tasks created."
);
