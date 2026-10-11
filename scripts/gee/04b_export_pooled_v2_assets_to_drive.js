/**** Export_POOLED_V2_assets_to_Drive.js ****/


// ======================================================
// 1. 基础设置
// ======================================================

var MP = ee.FeatureCollection(
  "projects/YOUR_GEE_PROJECT/assets/MP"
);

var aoi = MP.geometry().simplify(1000);

var ASSET_ROOT =
  "projects/YOUR_GEE_PROJECT/assets/menggu";


// 推荐：只导出 predictors 和 valid masks。
// 需要完整备份时，将 EXPORT_QA 改成 true。
var EXPORT_PREDICTORS = true;
var EXPORT_QA = false;
var EXPORT_VALID_MASKS = true;


var DRIVE_FOLDER_PREDICTORS =
  "MP_GDE_POOLED_V2_PREDICTORS";

var DRIVE_FOLDER_QA =
  "MP_GDE_POOLED_V2_QA";

var DRIVE_FOLDER_MASKS =
  "MP_GDE_POOLED_V2_MASKS";


var EXPORT_CRS = "EPSG:4326";
var EXPORT_SCALE = 1000;
var NODATA = -9999;


// ======================================================
// 2. 资产列表
// ======================================================

var periods = [

  {
    label: "P1_2003_2007",

    predictor:
      ASSET_ROOT +
      "/MP_PREDICTORS_P1_2003_2007_POOLED_V2_1KM",

    qa:
      ASSET_ROOT +
      "/MP_PREDICTOR_QA_P1_2003_2007_POOLED_V2_1KM"
  },

  {
    label: "P2_2008_2011",

    predictor:
      ASSET_ROOT +
      "/MP_PREDICTORS_P2_2008_2011_POOLED_V2_1KM",

    qa:
      ASSET_ROOT +
      "/MP_PREDICTOR_QA_P2_2008_2011_POOLED_V2_1KM"
  },

  {
    label: "P3_2012_2015",

    predictor:
      ASSET_ROOT +
      "/MP_PREDICTORS_P3_2012_2015_POOLED_V2_1KM",

    qa:
      ASSET_ROOT +
      "/MP_PREDICTOR_QA_P3_2012_2015_POOLED_V2_1KM"
  },

  {
    label: "P4_2016_2019",

    predictor:
      ASSET_ROOT +
      "/MP_PREDICTORS_P4_2016_2019_POOLED_V2_1KM",

    qa:
      ASSET_ROOT +
      "/MP_PREDICTOR_QA_P4_2016_2019_POOLED_V2_1KM"
  },

  {
    label: "P5_2020_2024",

    predictor:
      ASSET_ROOT +
      "/MP_PREDICTORS_P5_2020_2024_POOLED_V2_1KM",

    qa:
      ASSET_ROOT +
      "/MP_PREDICTOR_QA_P5_2020_2024_POOLED_V2_1KM"
  }
];


var validMaskAsset =
  ASSET_ROOT +
  "/MP_PREDICTOR_VALID_MASKS_POOLED_V2";


// ======================================================
// 3. 导出函数
// ======================================================

function exportImageToDrive(
  image,
  outputName,
  folder
) {

  var outputImage = image

    .toFloat()

    .unmask({
      value: NODATA,
      sameFootprint: false
    })

    .clip(aoi);


  Export.image.toDrive({

    image: outputImage,

    description: outputName,

    folder: folder,

    fileNamePrefix: outputName,

    region: aoi,

    crs: EXPORT_CRS,

    scale: EXPORT_SCALE,

    maxPixels: 1e13,

    shardSize: 256,

    fileDimensions: 8192,

    skipEmptyTiles: true,

    fileFormat: "GeoTIFF",

    formatOptions: {

      cloudOptimized: true,

      noData: NODATA
    }
  });
}


// ======================================================
// 4. 创建导出任务
// ======================================================

periods.forEach(function(period) {

  if (EXPORT_PREDICTORS) {

    exportImageToDrive(

      ee.Image(period.predictor),

      "MP_PREDICTORS_" +
      period.label +
      "_POOLED_V2_1KM",

      DRIVE_FOLDER_PREDICTORS
    );
  }


  if (EXPORT_QA) {

    exportImageToDrive(

      ee.Image(period.qa),

      "MP_PREDICTOR_QA_" +
      period.label +
      "_POOLED_V2_1KM",

      DRIVE_FOLDER_QA
    );
  }
});


if (EXPORT_VALID_MASKS) {

  exportImageToDrive(

    ee.Image(validMaskAsset),

    "MP_PREDICTOR_VALID_MASKS_POOLED_V2",

    DRIVE_FOLDER_MASKS
  );
}


print("Drive export tasks created.");
