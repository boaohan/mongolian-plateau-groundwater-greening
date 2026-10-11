/**** 06_07_build_stable_anchor_candidates_pooled_v2.js ****/


// ======================================================
// 1. 基础设置
// ======================================================

var MP = ee.FeatureCollection(
  "projects/YOUR_GEE_PROJECT/assets/MP"
);

var aoi = MP.geometry().simplify(1000);

var ASSET_ROOT =
  "projects/YOUR_GEE_PROJECT/assets/menggu";

var DRIVE_FOLDER =
  "MP_GDE_POOLED_V2_ANCHORS";

var SCALE = 1000;


// ======================================================
// 2. Predictor波段
// ======================================================

var PREDICTOR_BANDS = [

  "NDVI_mean",
  "NDVI_max",
  "NDVI_min",
  "NDVI_CV",

  "NDVI_retention",
  "retention_valid",

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


// ======================================================
// 3. 读取五期Predictor
// ======================================================

var P1 = ee.Image(
  ASSET_ROOT +
  "/MP_PREDICTORS_P1_2003_2007_POOLED_V2_1KM"
).select(PREDICTOR_BANDS);


var P2 = ee.Image(
  ASSET_ROOT +
  "/MP_PREDICTORS_P2_2008_2011_POOLED_V2_1KM"
).select(PREDICTOR_BANDS);


var P3 = ee.Image(
  ASSET_ROOT +
  "/MP_PREDICTORS_P3_2012_2015_POOLED_V2_1KM"
).select(PREDICTOR_BANDS);


var P4 = ee.Image(
  ASSET_ROOT +
  "/MP_PREDICTORS_P4_2016_2019_POOLED_V2_1KM"
).select(PREDICTOR_BANDS);


var P5 = ee.Image(
  ASSET_ROOT +
  "/MP_PREDICTORS_P5_2020_2024_POOLED_V2_1KM"
).select(PREDICTOR_BANDS);


var PERIOD_IMAGES = [
  P1,
  P2,
  P3,
  P4,
  P5
];


var referenceProjection =
  P1.select("NDVI_mean").projection();


// ======================================================
// 4. 五期共同有效域
// ======================================================

var validMasks = ee.Image(
  ASSET_ROOT +
  "/MP_PREDICTOR_VALID_MASKS_POOLED_V2"
);


var commonAll5 = validMasks

  .select("common_valid_all5")

  .eq(1);


// ======================================================
// 5. 工具函数
// ======================================================

function countPeriods(conditionFunction) {

  var conditionImages =
    PERIOD_IMAGES.map(function(image) {

      return conditionFunction(image)

        .unmask(0)

        .rename("condition")

        .toByte();
    });


  return ee.ImageCollection

    .fromImages(conditionImages)

    .sum()

    .rename("period_count");
}


function naturalVegetation(image) {

  return image
    .select("built_frac")
    .lt(0.10)

    .and(
      image
        .select("cropland_frac")
        .lt(0.20)
    )

    .and(
      image
        .select("bare_frac")
        .lt(0.60)
    );
}


// ======================================================
// 6. 正样本1：稳定湖岸、河岸和湿地边缘
// ======================================================

var positiveWaterCount =
  countPeriods(function(image) {

    var nearWater = image
      .select("dist_persistent_water")
      .lte(3000)

      .or(
        image
          .select("dist_seasonal_water")
          .lte(3000)
      )

      .or(
        image
          .select("water_frequency")
          .gte(0.10)
      );


    return naturalVegetation(image)

      .and(
        image
          .select("HAND")
          .lt(15)
      )

      .and(nearWater)

      .and(
        image
          .select("NDVI_mean")
          .gt(0.15)
      )

      .and(
        image
          .select("ET_PET")
          .gt(0.20)
      )

      // 排除开阔水体主导像元。
      .and(
        image
          .select("water_wetland_frac")
          .lt(0.80)
      )

      .and(
        image
          .select("water_frequency")
          .lt(0.80)
      );
  });


var P_water_margin = positiveWaterCount

  .gte(3)

  .and(commonAll5);


// ======================================================
// 7. 正样本2：干旱区远水韧性植被代理
// ======================================================

var positiveDrylandCount =
  countPeriods(function(image) {

    return naturalVegetation(image)

      .and(
        image
          .select("forest_frac")
          .lt(0.20)
      )

      .and(
        image
          .select("Aridity_index")
          .lt(0.50)
      )

      .and(
        image
          .select("PDSI_mean")
          .lt(0)
      )

      .and(
        image
          .select("dist_persistent_water")
          .gt(3000)
      )

      .and(
        image
          .select("water_frequency")
          .lt(0.05)
      )

      .and(
        image
          .select("retention_valid")
          .eq(1)
      )

      .and(
        image
          .select("NDVI_retention")
          .gt(0.80)
      )

      .and(
        image
          .select("ET_PET")
          .gt(0.20)
      )

      .and(
        image
          .select("NDVI_mean")
          .gt(0.10)
      );
  });


var P_dryland_proxy = positiveDrylandCount

  .gte(3)

  .and(commonAll5)

  .and(P_water_margin.not());


// ======================================================
// 8. 普通负样本：稳定荒漠和裸地
// ======================================================

var desertCount =
  countPeriods(function(image) {

    var sparseOrBare = image
      .select("bare_frac")
      .gt(0.60)

      .or(
        image
          .select("NDVI_mean")
          .lt(0.08)
      );


    return sparseOrBare

      .and(
        image
          .select("ET_PET")
          .lt(0.15)
      )

      .and(
        image
          .select("water_frequency")
          .lt(0.03)
      )

      .and(
        image
          .select("dist_persistent_water")
          .gt(5000)
      );
  });


// ======================================================
// 9. 建成区负样本
// ======================================================

var builtCount =
  countPeriods(function(image) {

    return image
      .select("built_frac")
      .gt(0.15);
  });


// ======================================================
// 10. 耕地负样本
// ======================================================

var croplandCount =
  countPeriods(function(image) {

    return image
      .select("cropland_frac")
      .gt(0.60)

      .and(
        image
          .select("NDVI_mean")
          .gt(0.10)
      );
  });


// ======================================================
// 11. 高地草地/灌丛hard negative
// ======================================================

var uplandGrassCount =
  countPeriods(function(image) {

    return image
      .select("grass_shrub_frac")
      .gt(0.60)

      .and(
        image
          .select("HAND")
          .gt(30)
      )

      .and(
        image
          .select("dist_persistent_water")
          .gt(5000)
      )

      .and(
        image
          .select("dist_seasonal_water")
          .gt(5000)
      )

      .and(
        image
          .select("water_frequency")
          .lt(0.05)
      )

      .and(
        image
          .select("NDVI_mean")
          .gt(0.15)
      )

      .and(
        image
          .select("built_frac")
          .lt(0.10)
      )

      .and(
        image
          .select("cropland_frac")
          .lt(0.20)
      );
  });


// ======================================================
// 12. 山地森林hard negative
// ======================================================

var mountainForestCount =
  countPeriods(function(image) {

    var uplandTerrain = image
      .select("HAND")
      .gt(30)

      .or(
        image
          .select("slope")
          .gt(10)
      );


    return image
      .select("forest_frac")
      .gt(0.60)

      .and(uplandTerrain)

      .and(
        image
          .select("dist_persistent_water")
          .gt(5000)
      )

      .and(
        image
          .select("dist_seasonal_water")
          .gt(5000)
      )

      .and(
        image
          .select("NDVI_mean")
          .gt(0.20)
      )

      .and(
        image
          .select("water_frequency")
          .lt(0.05)
      );
  });


// ======================================================
// 13. 湿润远水天然植被hard negative
// ======================================================

var wetFarCount =
  countPeriods(function(image) {

    var humidBackground = image
      .select("Aridity_index")
      .gte(0.65)

      .or(
        image
          .select("PDSI_mean")
          .gte(0)
      );


    return naturalVegetation(image)

      .and(humidBackground)

      .and(
        image
          .select("HAND")
          .gt(20)
      )

      .and(
        image
          .select("dist_persistent_water")
          .gt(5000)
      )

      .and(
        image
          .select("dist_seasonal_water")
          .gt(5000)
      )

      .and(
        image
          .select("water_frequency")
          .lt(0.05)
      )

      .and(
        image
          .select("NDVI_mean")
          .gt(0.20)
      )

      .and(
        image
          .select("ET_PET")
          .gt(0.25)
      );
  });


// ======================================================
// 14. 构建互斥样本区
// ======================================================

var used = P_water_margin
  .or(P_dryland_proxy);


var N_built = builtCount

  .gte(2)

  .and(commonAll5)

  .and(used.not());


used = used.or(N_built);


var N_cropland = croplandCount

  .gte(3)

  .and(commonAll5)

  .and(used.not());


used = used.or(N_cropland);


var N_mountain_forest =
  mountainForestCount

    .gte(3)

    .and(commonAll5)

    .and(used.not());


used = used.or(N_mountain_forest);


var N_upland_grass_shrub =
  uplandGrassCount

    .gte(3)

    .and(commonAll5)

    .and(used.not());


used = used.or(N_upland_grass_shrub);


var N_wet_far_natural =
  wetFarCount

    .gte(3)

    .and(commonAll5)

    .and(used.not());


used = used.or(N_wet_far_natural);


var N_desert_bare = desertCount

  .gte(3)

  .and(commonAll5)

  .and(used.not());


// ======================================================
// 15. 样本类型编码
// ======================================================
//
// 1  = 正样本：近水天然植被
// 2  = 正样本：干旱区韧性植被代理
//
// 10 = 普通负样本：荒漠裸地
// 11 = 建成区
// 12 = 耕地
// 13 = 高地草地/灌丛
// 14 = 山地森林
// 15 = 湿润远水天然植被
// ======================================================

var sampleType = ee.Image.constant(0)

  .toInt16()

  .setDefaultProjection(referenceProjection)

  .where(P_water_margin, 1)

  .where(P_dryland_proxy, 2)

  .where(N_desert_bare, 10)

  .where(N_built, 11)

  .where(N_cropland, 12)

  .where(N_upland_grass_shrub, 13)

  .where(N_mountain_forest, 14)

  .where(N_wet_far_natural, 15)

  .rename("sample_type_id");


sampleType = sampleType

  .updateMask(sampleType.gt(0))

  .updateMask(commonAll5);


// ======================================================
// 16. 分层抽取候选点
// ======================================================

// 候选数量应明显大于Python最终保留数量。
var classValues = [
  1,
  2,
  10,
  11,
  12,
  13,
  14,
  15
];


var classPoints = [

  2000,  // P_water_margin
  1500,  // P_dryland_proxy

  1200,  // N_desert_bare
  600,   // N_built
  1200,  // N_cropland

  2200,  // N_upland_grass_shrub
  2000,  // N_mountain_forest
  2000   // N_wet_far_natural
];


var samplingImage = sampleType

  .addBands(
    ee.Image.pixelLonLat()
  );


var candidates = samplingImage
  .stratifiedSample({

    numPoints: 100,

    classBand: "sample_type_id",

    region: aoi,

    scale: SCALE,

    projection: referenceProjection,

    classValues: classValues,

    classPoints: classPoints,

    seed: 20260722,

    dropNulls: true,

    geometries: true,

    tileScale: 16
  });


// ======================================================
// 17. 添加属性
// ======================================================

var typeNames = ee.Dictionary({

  "1":
    "P_water_margin",

  "2":
    "P_dryland_resilient_proxy",

  "10":
    "N_desert_bare",

  "11":
    "N_built",

  "12":
    "N_cropland",

  "13":
    "N_upland_grass_shrub",

  "14":
    "N_mountain_forest",

  "15":
    "N_wet_far_natural"
});


candidates = candidates.map(function(feature) {

  var typeId = ee.Number(
    feature.get("sample_type_id")
  );


  var longitude = ee.Number(
    feature.get("longitude")
  );


  var latitude = ee.Number(
    feature.get("latitude")
  );


  var classValue = ee.Number(

    ee.Algorithms.If(

      typeId.lt(10),

      1,

      0
    )
  );


  var typeName = typeNames.get(

    typeId.format("%.0f")
  );


  var sampleId = ee.String("C")

    .cat(
      typeId.format("%02d")
    )

    .cat("_")

    .cat(
      longitude.format("%.5f")
    )

    .cat("_")

    .cat(
      latitude.format("%.5f")
    );


  return feature.set({

    sample_id:
      sampleId,

    sample_type_id:
      typeId,

    sample_type:
      typeName,

    class:
      classValue,

    lon:
      longitude,

    lat:
      latitude,

    candidate_version:
      "pooled_v2"
  });
});


print(
  "Candidate total:",
  candidates.size()
);


print(
  "Candidate type counts:",
  candidates.aggregate_histogram(
    "sample_type"
  )
);


// ======================================================
// 18. 地图检查
// ======================================================

Map.centerObject(MP, 4);


Map.addLayer(

  sampleType,

  {
    min: 1,
    max: 15,

    palette: [

      "006837",
      "31a354",

      "d9d9d9",
      "d9d9d9",
      "d9d9d9",
      "d9d9d9",
      "d9d9d9",
      "d9d9d9",
      "d9d9d9",

      "8c510a",
      "762a83",
      "f46d43",
      "fdae61",
      "d73027",
      "4575b4"
    ]
  },

  "Stable sample zones"
);


Map.addLayer(

  candidates,

  {
    color: "000000"
  },

  "Candidate points",

  false
);


// ======================================================
// 19. 导出
// ======================================================

Export.table.toDrive({

  collection: candidates,

  description:
    "MP_PGDE_anchor_candidates_pooled_v2",

  folder:
    DRIVE_FOLDER,

  fileNamePrefix:
    "MP_PGDE_anchor_candidates_pooled_v2",

  fileFormat:
    "CSV",

  selectors: [

    "sample_id",
    "sample_type_id",
    "sample_type",
    "class",
    "lon",
    "lat",
    "candidate_version"
  ]
});


Export.table.toAsset({

  collection: candidates,

  description:
    "ASSET_MP_PGDE_anchor_candidates_pooled_v2",

  assetId:
    ASSET_ROOT +
    "/MP_PGDE_anchor_candidates_pooled_v2"
});


Export.image.toAsset({

  image:
    sampleType.unmask(0),

  description:
    "ASSET_MP_PGDE_anchor_zone_types_pooled_v2",

  assetId:
    ASSET_ROOT +
    "/MP_PGDE_anchor_zone_types_pooled_v2",

  region:
    aoi,

  scale:
    SCALE,

  crs:
    "EPSG:4326",

  maxPixels:
    1e13,

  pyramidingPolicy: {

    ".default":
      "mode"
  }
});


print(
  "Stable candidate tasks created."
);
