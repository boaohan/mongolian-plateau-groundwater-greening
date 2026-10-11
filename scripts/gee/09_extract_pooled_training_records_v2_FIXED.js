/**** 09_extract_pooled_training_records_v2_FIXED.js
 *
 * 修复内容：
 * 1. 根据CSV中的lon和lat重建点几何；
 * 2. 检查2994个点是否落入蒙古高原；
 * 3. 从五期POOLED_V2 predictor中提取变量；
 * 4. 导出14970条pooled training records；
 * 5. 同时导出到Drive和GEE Asset。
 *
 ***********************************************************************/


// ======================================================================
// 1. 基础设置
// ======================================================================

var MP = ee.FeatureCollection(
  "projects/YOUR_GEE_PROJECT/assets/MP"
);

var aoi = MP.geometry().simplify(1000);


var ASSET_ROOT =
  "projects/YOUR_GEE_PROJECT/assets/menggu";


var DRIVE_FOLDER =
  "MP_GDE_POOLED_V2_TRAINING";


var ANCHOR_ASSET =
  ASSET_ROOT +
  "/MP_PGDE_anchor_samples_pooled_v2";


// ======================================================================
// 2. 读取原始锚点属性表
// ======================================================================

var anchorsRaw = ee.FeatureCollection(
  ANCHOR_ASSET
);


print(
  "Raw anchor record count:",
  anchorsRaw.size()
);


print(
  "Raw first anchor:",
  anchorsRaw.first()
);

// ======================================================================
// 3. 根据 lon 和 lat 重新构建点几何
// ======================================================================

var anchors = anchorsRaw.map(function(feature) {

  // 从属性中读取经纬度。
  var lon = ee.Number(
    feature.get("lon")
  );

  var lat = ee.Number(
    feature.get("lat")
  );

  // ee.Geometry.Point最多接收：
  // 1. 坐标列表
  // 2. 可选投影
  //
  // 省略投影时默认使用EPSG:4326。
var point = ee.Geometry.Point(
  ee.List([lon, lat])
);

  // 创建具有正确Point几何的新Feature，
  // 并复制原始Feature的全部属性。
  return ee.Feature(point)
    .copyProperties(feature);
});


// 仅保留位于研究区内的锚点。
var anchorsInAOI = anchors.filterBounds(
  aoi
);


print(
  "Reconstructed anchor count:",
  anchors.size()
);

print(
  "Anchors within AOI:",
  anchorsInAOI.size()
);

print(
  "First reconstructed anchor:",
  anchorsInAOI.first()
);

print(
  "First reconstructed geometry type:",
  anchorsInAOI.first()
    .geometry()
    .type()
);

print(
  "Anchor class histogram:",
  anchorsInAOI.aggregate_histogram(
    "class"
  )
);


print(
  "Anchor sample-type histogram:",
  anchorsInAOI.aggregate_histogram(
    "sample_type"
  )
);


print(
  "Anchor fold5 histogram:",
  anchorsInAOI.aggregate_histogram(
    "fold5"
  )
);


// 正常结果应为：
// Reconstructed anchor count = 2994
// Anchors within AOI = 2994


// ======================================================================
// 4. 地图检查点几何
// ======================================================================

Map.centerObject(
  MP,
  4
);


Map.addLayer(
  ee.Image().byte().paint(
    MP,
    1,
    2
  ),
  {
    palette: ["000000"]
  },
  "Mongolian Plateau boundary"
);


Map.addLayer(
  anchorsInAOI.filter(
    ee.Filter.eq("class", 1)
  ),
  {
    color: "00AA00"
  },
  "Positive anchors"
);


Map.addLayer(
  anchorsInAOI.filter(
    ee.Filter.eq("class", 0)
  ),
  {
    color: "CC0000"
  },
  "Negative anchors"
);


// ======================================================================
// 5. Predictor波段
// ======================================================================

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


// ======================================================================
// 6. 需要继承的锚点属性
// ======================================================================

var META_PROPERTIES = [

  "sample_id",
  "sample_type_id",
  "sample_type",
  "class",

  "lon",
  "lat",

  "block_1deg",
  "block_2deg",

  "fold5",
  "fold10",

  "anchor_version"
];


// ======================================================================
// 7. 五期Predictor资产
// ======================================================================

var periods = [

  {
    id: "P1",
    index: 1,
    midpoint: 2005.0,

    asset:
      ASSET_ROOT +
      "/MP_PREDICTORS_P1_2003_2007_POOLED_V2_1KM"
  },

  {
    id: "P2",
    index: 2,
    midpoint: 2009.5,

    asset:
      ASSET_ROOT +
      "/MP_PREDICTORS_P2_2008_2011_POOLED_V2_1KM"
  },

  {
    id: "P3",
    index: 3,
    midpoint: 2013.5,

    asset:
      ASSET_ROOT +
      "/MP_PREDICTORS_P3_2012_2015_POOLED_V2_1KM"
  },

  {
    id: "P4",
    index: 4,
    midpoint: 2017.5,

    asset:
      ASSET_ROOT +
      "/MP_PREDICTORS_P4_2016_2019_POOLED_V2_1KM"
  },

  {
    id: "P5",
    index: 5,
    midpoint: 2022.0,

    asset:
      ASSET_ROOT +
      "/MP_PREDICTORS_P5_2020_2024_POOLED_V2_1KM"
  }
];


// ======================================================================
// 8. 单期提取函数
// ======================================================================

function sampleOnePeriod(period) {

  var image = ee.Image(
    period.asset
  ).select(
    PREDICTOR_BANDS
  );


  // 不再显式传入projection，直接使用影像第一波段的默认投影。
  // 这样可避免上传点和栅格投影组合造成额外问题。
  var samples = image.sampleRegions({

    collection:
      anchorsInAOI,

    properties:
      META_PROPERTIES,

    scale:
      1000,

    tileScale:
      8,

    geometries:
      true
  });


  // 删除任何仍然存在缺失预测变量的记录。
  samples = samples.filter(
    ee.Filter.notNull(
      PREDICTOR_BANDS
    )
  );


  // 添加时期信息。
  samples = samples.map(function(feature) {

    return feature.set({

      period_id:
        period.id,

      period_index:
        period.index,

      midpoint_year:
        period.midpoint,

      training_version:
        "pooled_v2"
    });
  });


  return samples;
}


// ======================================================================
// 9. 分别提取五期
// ======================================================================

var samplesP1 = sampleOnePeriod(
  periods[0]
);

var samplesP2 = sampleOnePeriod(
  periods[1]
);

var samplesP3 = sampleOnePeriod(
  periods[2]
);

var samplesP4 = sampleOnePeriod(
  periods[3]
);

var samplesP5 = sampleOnePeriod(
  periods[4]
);


// ======================================================================
// 10. 五期记录数量检查
// ======================================================================

print(
  "P1 extracted count:",
  samplesP1.size()
);

print(
  "P2 extracted count:",
  samplesP2.size()
);

print(
  "P3 extracted count:",
  samplesP3.size()
);

print(
  "P4 extracted count:",
  samplesP4.size()
);

print(
  "P5 extracted count:",
  samplesP5.size()
);


// 理想结果：
// P1 = 2994
// P2 = 2994
// P3 = 2994
// P4 = 2994
// P5 = 2994


// ======================================================================
// 11. 合并五期
// ======================================================================

var pooledSamples = samplesP1

  .merge(samplesP2)

  .merge(samplesP3)

  .merge(samplesP4)

  .merge(samplesP5);


print(
  "Pooled record count:",
  pooledSamples.size()
);


// 理想结果：
// 2994 × 5 = 14970


print(
  "Records by period:",
  pooledSamples.aggregate_histogram(
    "period_id"
  )
);


print(
  "Records by class:",
  pooledSamples.aggregate_histogram(
    "class"
  )
);


print(
  "Records by sample type:",
  pooledSamples.aggregate_histogram(
    "sample_type"
  )
);


print(
  "First pooled record:",
  pooledSamples.first()
);


// ======================================================================
// 12. 构建时期汇总表
// ======================================================================

var periodSummary = ee.FeatureCollection([

  ee.Feature(null, {
    period_id: "P1",
    anchor_count: anchorsInAOI.size(),
    extracted_count: samplesP1.size()
  }),

  ee.Feature(null, {
    period_id: "P2",
    anchor_count: anchorsInAOI.size(),
    extracted_count: samplesP2.size()
  }),

  ee.Feature(null, {
    period_id: "P3",
    anchor_count: anchorsInAOI.size(),
    extracted_count: samplesP3.size()
  }),

  ee.Feature(null, {
    period_id: "P4",
    anchor_count: anchorsInAOI.size(),
    extracted_count: samplesP4.size()
  }),

  ee.Feature(null, {
    period_id: "P5",
    anchor_count: anchorsInAOI.size(),
    extracted_count: samplesP5.size()
  })
]);


print(
  "Period extraction summary:",
  periodSummary
);


// ======================================================================
// 13. 设置导出字段顺序
// ======================================================================

var EXPORT_COLUMNS = META_PROPERTIES

  .concat([

    "period_id",
    "period_index",
    "midpoint_year",
    "training_version"
  ])

  .concat(
    PREDICTOR_BANDS
  );


var pooledOutput = pooledSamples.select(
  EXPORT_COLUMNS
);


// ======================================================================
// 14. 导出五期pooled训练记录到Drive
// ======================================================================

Export.table.toDrive({

  collection:
    pooledOutput,

  description:
    "MP_PGDE_pooled_training_records_v2_FIXED",

  folder:
    DRIVE_FOLDER,

  fileNamePrefix:
    "MP_PGDE_pooled_training_records_v2_FIXED",

  fileFormat:
    "CSV",

  selectors:
    EXPORT_COLUMNS
});


// ======================================================================
// 15. 导出五期pooled训练记录到Asset
// ======================================================================

Export.table.toAsset({

  collection:
    pooledOutput,

  description:
    "ASSET_MP_PGDE_pooled_training_records_v2_FIXED",

  assetId:
    ASSET_ROOT +
    "/MP_PGDE_pooled_training_records_v2",

  // 不设置selectors，直接使用pooledOutput的字段。
});


// ======================================================================
// 16. 导出时期汇总
// ======================================================================

Export.table.toDrive({

  collection:
    periodSummary,

  description:
    "MP_PGDE_pooled_training_period_summary_v2_FIXED",

  folder:
    DRIVE_FOLDER,

  fileNamePrefix:
    "MP_PGDE_pooled_training_period_summary_v2_FIXED",

  fileFormat:
    "CSV"
});


// ======================================================================
// 17. 可选：将修复几何后的锚点重新保存为Asset
// ======================================================================

Export.table.toAsset({

  collection:
    anchorsInAOI,

  description:
    "ASSET_MP_PGDE_anchor_samples_pooled_v2_GEOMETRY_FIXED",

  assetId:
    ASSET_ROOT +
    "/MP_PGDE_anchor_samples_pooled_v2_geometry_fixed"
});


print(
  "Fixed pooled-training export tasks created."
);
