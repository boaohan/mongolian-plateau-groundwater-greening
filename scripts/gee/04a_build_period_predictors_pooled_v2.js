/**** 04a_build_period_predictors_pooled_v2.js **************************
 *
 * 蒙古高原五期 PGDE 统一预测变量构建（POOLED_V2）
 *
 * 主要修改：
 * 1. 五期使用完全一致的变量定义和波段顺序；
 * 2. 主 ET/PET 改为 TerraClimate AET/PET；
 * 3. MOD16 ET/PET 只作为 QA 和敏感性变量，
 *    不再控制主模型有效区域；
 * 4. NDVI retention 使用五期统一 pooled median 填补；
 * 5. retention_valid 保留在资产中，用于样本筛选和 QA；
 * 6. 不再执行湿润远水、森林远水和耕地的人工降权；
 * 7. 输出五期 predictor 和 QA 资产，版本为 POOLED_V2。
 *
 * 时期：
 * P1 = 2003–2007
 * P2 = 2008–2011
 * P3 = 2012–2015
 * P4 = 2016–2019
 * P5 = 2020–2024
 *
 ***********************************************************************/


// ======================================================================
// 1. 用户设置
// ======================================================================

var MP = ee.FeatureCollection(
  "projects/YOUR_GEE_PROJECT/assets/MP"
);

var aoi = MP.geometry().simplify(1000);

var aoiMask = ee.Image.constant(1)
  .clip(aoi)
  .rename("aoi_mask");


// 输出资产文件夹必须已经存在。
var OUT_ASSET_ROOT =
  "projects/YOUR_GEE_PROJECT/assets/menggu";


var DRIVE_PREDICTOR_FOLDER =
  "MP_GDE_POOLED_V2_PREDICTORS";

var DRIVE_QA_FOLDER =
  "MP_GDE_POOLED_V2_QA";


// 正式运行建议只输出到 Asset。
// 需要本地备份时，再把 EXPORT_TO_DRIVE 改为 true。
var EXPORT_TO_ASSET = true;
var EXPORT_TO_DRIVE = false;


// 为避免之前 EPSG:6933 无法解析的问题，
// GEE 导出统一使用 EPSG:4326。
var EXPORT_CRS = "EPSG:4326";
var EXPORT_SCALE = 1000;

var EXPORT_REGION = aoi.bounds(1000);

var NODATA = -9999;


// 调试时可改成 ["P1"]。
// 正式运行五期使用下面设置。
var PERIOD_IDS_TO_RUN = [
  "P1",
  "P2",
  "P3",
  "P4",
  "P5"
];


// 生长季。
var GROW_START_MONTH = 5;
var GROW_END_MONTH = 9;


// NDVI retention 中绝对干旱的定义。
var DROUGHT_PDSI_THRESHOLD = -2;

var MIN_DROUGHT_MONTHS = 3;
var MIN_NON_DROUGHT_MONTHS = 3;


// MNDWI 水体参数。
var MNDWI_WATER_THRESHOLD = 0.20;

var PERSISTENT_WATER_FREQUENCY = 0.50;
var SEASONAL_WATER_FREQUENCY = 0.20;


// 距离搜索参数。
var DISTANCE_SEARCH_PIXELS = 256;

// MOD09A1 原始分辨率约 500 m。
var APPROX_MOD09_PIXEL_METERS = 500;

var MAX_DISTANCE_METERS = 100000;


// 每个时期用于估计统一 retention 中位数的抽样数量。
var RETENTION_SAMPLE_NUMBER = 20000;
var RETENTION_SAMPLE_SCALE = 5000;


// ======================================================================
// 2. 五个时期定义
// ======================================================================

var PERIODS = [
  {
    id: "P1",
    startYear: 2003,
    endYear: 2007,
    midpoint: 2005.0,
    label: "P1_2003_2007"
  },

  {
    id: "P2",
    startYear: 2008,
    endYear: 2011,
    midpoint: 2009.5,
    label: "P2_2008_2011"
  },

  {
    id: "P3",
    startYear: 2012,
    endYear: 2015,
    midpoint: 2013.5,
    label: "P3_2012_2015"
  },

  {
    id: "P4",
    startYear: 2016,
    endYear: 2019,
    midpoint: 2017.5,
    label: "P4_2016_2019"
  },

  {
    id: "P5",
    startYear: 2020,
    endYear: 2024,
    midpoint: 2022.0,
    label: "P5_2020_2024"
  }
];


// ======================================================================
// 3. 波段定义
// ======================================================================

// Predictor Asset 中保留 retention_valid，
// 便于后续构建训练样本和质量控制。
var PREDICTOR_BANDS = [

  // 植被状态。
  "NDVI_mean",
  "NDVI_max",
  "NDVI_min",
  "NDVI_CV",

  // 干旱响应。
  "NDVI_retention",
  "retention_valid",

  // 主分析使用 TerraClimate AET/PET。
  "ET_PET",

  // 地表水和水文位置。
  "MNDWI_mean",
  "water_frequency",
  "dist_persistent_water",
  "dist_seasonal_water",

  // 气候背景。
  "PDSI_mean",
  "precip_mean",
  "temp_mean",
  "Aridity_index",

  // 地形与水文位置。
  "elevation",
  "slope",
  "HAND",

  // 时期土地覆盖出现比例。
  "forest_frac",
  "grass_shrub_frac",
  "cropland_frac",
  "built_frac",
  "bare_frac",
  "water_wetland_frac"
];


// 最终 pooled RF 使用的波段。
// retention_valid 是观测有效性变量，不进入最终生态模型。
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


var QA_BANDS = [

  "NDVI_year_count",

  "drought_month_count",
  "nondrought_month_count",
  "retention_valid_QA",

  "TC_ETPET_year_count",

  // MOD16 仅作为 QA 和敏感性变量。
  "MOD16_ET_PET",
  "MOD16_ETPET_year_count",

  "MNDWI_year_count",
  "climate_year_count",
  "LC_year_count",

  "native_predictor_valid",
  "model_valid"
];


// ======================================================================
// 4. 数据源
// ======================================================================

var MOD13 = ee.ImageCollection(
  "MODIS/061/MOD13Q1"
).filterBounds(aoi);


var MOD16 = ee.ImageCollection(
  "MODIS/061/MOD16A2GF"
).filterBounds(aoi);


var MOD09 = ee.ImageCollection(
  "MODIS/061/MOD09A1"
).filterBounds(aoi);


var TERRACLIMATE = ee.ImageCollection(
  "IDAHO_EPSCOR/TERRACLIMATE"
).filterBounds(aoi);


var MCD12 = ee.ImageCollection(
  "MODIS/061/MCD12Q1"
).filterBounds(aoi);


// ======================================================================
// 5. 静态地形和水文位置
// ======================================================================

var srtm = ee.Image(
  "USGS/SRTMGL1_003"
).select("elevation");


var elevation = srtm
  .rename("elevation")
  .clip(aoi)
  .resample("bilinear")
  .toFloat();


var slope = ee.Terrain.slope(srtm)
  .rename("slope")
  .clip(aoi)
  .resample("bilinear")
  .toFloat();


var HAND = ee.Image(
  "MERIT/Hydro/v1_0_1"
)
  .select("hnd")
  .rename("HAND")
  .clip(aoi)
  .resample("bilinear")
  .toFloat();


// ======================================================================
// 6. MOD13Q1 NDVI 预处理
// ======================================================================

function maskMOD13Q1(image) {

  var ndvi = image
    .select("NDVI")
    .multiply(0.0001)
    .rename("NDVI");

  var qa = image.select("SummaryQA");

  // SummaryQA：
  // 0 = good
  // 1 = marginal
  // 2 = snow/ice
  // 3 = cloudy
  var valid = qa.lte(1)
    .and(ndvi.gte(-0.2))
    .and(ndvi.lte(1.0));

  return ndvi
    .updateMask(valid)
    .copyProperties(
      image,
      ["system:time_start"]
    );
}


// 计算逐年生长季 NDVI。
function buildAnnualGrowingSeasonNDVI(
  startYear,
  endYear
) {

  var years = ee.List.sequence(
    startYear,
    endYear
  );

  var collection = MOD13
    .filterDate(
      ee.Date.fromYMD(startYear, 1, 1),
      ee.Date.fromYMD(endYear + 1, 1, 1)
    )
    .map(maskMOD13Q1);

  return ee.ImageCollection.fromImages(

    years.map(function(year) {

      year = ee.Number(year);

      return collection

        .filter(
          ee.Filter.calendarRange(
            year,
            year,
            "year"
          )
        )

        .filter(
          ee.Filter.calendarRange(
            GROW_START_MONTH,
            GROW_END_MONTH,
            "month"
          )
        )

        .mean()
        .rename("NDVI")
        .clip(aoi)

        .set("year", year)

        .set(
          "system:time_start",
          ee.Date.fromYMD(
            year,
            7,
            1
          ).millis()
        );
    })
  );
}


// ======================================================================
// 7. 月尺度 NDVI—PDSI 与 NDVI retention
// ======================================================================

function buildMonthlyNdviPdsi(
  startYear,
  endYear
) {

  var years = ee.List.sequence(
    startYear,
    endYear
  );

  var months = ee.List.sequence(
    GROW_START_MONTH,
    GROW_END_MONTH
  );

  var ndviCollection = MOD13

    .filterDate(
      ee.Date.fromYMD(startYear, 1, 1),
      ee.Date.fromYMD(endYear + 1, 1, 1)
    )

    .map(maskMOD13Q1);


  var nestedList = years.map(function(year) {

    year = ee.Number(year);

    return months.map(function(month) {

      month = ee.Number(month);

      var monthStart = ee.Date.fromYMD(
        year,
        month,
        1
      );

      var monthEnd = monthStart.advance(
        1,
        "month"
      );


      var ndvi = ndviCollection

        .filterDate(
          monthStart,
          monthEnd
        )

        .mean()
        .rename("NDVI");


      var pdsi = TERRACLIMATE

        .filterDate(
          monthStart,
          monthEnd
        )

        .select("pdsi")
        .mean()
        .multiply(0.01)
        .rename("PDSI");


      return ndvi

        .addBands(pdsi)

        .set("year", year)

        .set("month", month)

        .set(
          "system:time_start",
          monthStart.millis()
        );
    });
  }).flatten();


  return ee.ImageCollection.fromImages(
    nestedList
  );
}


// 构建未填补的 NDVI retention。
function buildNdviRetentionRaw(
  startYear,
  endYear
) {

  var monthly = buildMonthlyNdviPdsi(
    startYear,
    endYear
  );


  // 绝对干旱月份 NDVI。
  var droughtNdvi = monthly.map(
    function(image) {

      return image
        .select("NDVI")
        .updateMask(
          image
            .select("PDSI")
            .lt(DROUGHT_PDSI_THRESHOLD)
        );
    }
  ).mean();


  // 非绝对干旱月份 NDVI。
  var nondroughtNdvi = monthly.map(
    function(image) {

      return image
        .select("NDVI")
        .updateMask(
          image
            .select("PDSI")
            .gte(DROUGHT_PDSI_THRESHOLD)
        );
    }
  ).mean();


  // 有效绝对干旱月份数量。
  var droughtCount = monthly.map(
    function(image) {

      var validMask = image
        .select("NDVI")
        .mask()

        .and(
          image
            .select("PDSI")
            .mask()
        )

        .and(
          image
            .select("PDSI")
            .lt(DROUGHT_PDSI_THRESHOLD)
        );


      return ee.Image.constant(1)

        .rename("count")

        .updateMask(validMask)

        .unmask(0);
    }
  )

  .sum()

  .rename("drought_month_count")

  .clip(aoi)

  .toFloat();


  // 有效非干旱月份数量。
  var nondroughtCount = monthly.map(
    function(image) {

      var validMask = image
        .select("NDVI")
        .mask()

        .and(
          image
            .select("PDSI")
            .mask()
        )

        .and(
          image
            .select("PDSI")
            .gte(DROUGHT_PDSI_THRESHOLD)
        );


      return ee.Image.constant(1)

        .rename("count")

        .updateMask(validMask)

        .unmask(0);
    }
  )

  .sum()

  .rename("nondrought_month_count")

  .clip(aoi)

  .toFloat();


  var retentionValid = droughtCount

    .gte(MIN_DROUGHT_MONTHS)

    .and(
      nondroughtCount
        .gte(MIN_NON_DROUGHT_MONTHS)
    )

    .rename("retention_valid")

    .clip(aoi)

    .toFloat();


  var retentionRaw = droughtNdvi

    .divide(
      nondroughtNdvi.add(0.001)
    )

    .clamp(0, 2)

    .rename("NDVI_retention_raw")

    .updateMask(
      retentionValid.eq(1)
    )

    .clip(aoi)

    .toFloat();


  return {

    raw: retentionRaw,

    valid: retentionValid,

    droughtCount: droughtCount,

    nondroughtCount: nondroughtCount
  };
}


// ======================================================================
// 8. MOD16 ET/PET：只用于 QA 和敏感性
// ======================================================================

function prepareMOD16(image) {

  var ET = image
    .select("ET")
    .multiply(0.1)
    .rename("ET");

  var PET = image
    .select("PET")
    .multiply(0.1)
    .rename("PET");


  var valid = ET.gte(0)

    .and(PET.gt(0))

    .and(ET.lt(5000))

    .and(PET.lt(5000));


  return ET

    .addBands(PET)

    .updateMask(valid)

    .copyProperties(
      image,
      ["system:time_start"]
    );
}


function buildAnnualMOD16EtPet(
  startYear,
  endYear
) {

  var years = ee.List.sequence(
    startYear,
    endYear
  );


  var collection = MOD16

    .filterDate(
      ee.Date.fromYMD(startYear, 1, 1),
      ee.Date.fromYMD(endYear + 1, 1, 1)
    )

    .map(prepareMOD16);


  return ee.ImageCollection.fromImages(

    years.map(function(year) {

      year = ee.Number(year);

      var start = ee.Date.fromYMD(
        year,
        1,
        1
      );

      var end = start.advance(
        1,
        "year"
      );

      var yearly = collection.filterDate(
        start,
        end
      );


      var ET = yearly
        .select("ET")
        .sum();

      var PET = yearly
        .select("PET")
        .sum();


      return ET

        .divide(
          PET.add(0.001)
        )

        .updateMask(
          PET.gt(0)
        )

        .clamp(0, 2)

        .rename("MOD16_ET_PET_annual")

        .clip(aoi)

        .set("year", year)

        .set(
          "system:time_start",
          ee.Date.fromYMD(
            year,
            7,
            1
          ).millis()
        );
    })
  );
}


// ======================================================================
// 9. TerraClimate 年度气候变量
// ======================================================================

function buildAnnualClimate(
  startYear,
  endYear
) {

  var years = ee.List.sequence(
    startYear,
    endYear
  );


  var collection = TERRACLIMATE.filterDate(

    ee.Date.fromYMD(
      startYear,
      1,
      1
    ),

    ee.Date.fromYMD(
      endYear + 1,
      1,
      1
    )
  );


  return ee.ImageCollection.fromImages(

    years.map(function(year) {

      year = ee.Number(year);

      var start = ee.Date.fromYMD(
        year,
        1,
        1
      );

      var end = start.advance(
        1,
        "year"
      );

      var yearly = collection.filterDate(
        start,
        end
      );


      // 年降水量。
      var precipitation = yearly
        .select("pr")
        .sum()
        .rename("precip_annual");


      // 年实际蒸散量。
      var climateAET = yearly
        .select("aet")
        .sum()
        .multiply(0.1)
        .rename("climate_AET_annual");


      // 年潜在蒸散量。
      var climatePET = yearly
        .select("pet")
        .sum()
        .multiply(0.1)
        .rename("climate_PET_annual");


      // TerraClimate AET/PET。
      var TC_ETPET = climateAET

        .divide(
          climatePET.add(0.001)
        )

        .updateMask(
          climatePET.gt(0)
        )

        .clamp(0, 2)

        .rename("TC_ET_PET_annual");


      // 年均 PDSI。
      var PDSI = yearly
        .select("pdsi")
        .mean()
        .multiply(0.01)
        .rename("PDSI_annual");


      // 年均温度。
      var temperature = yearly.map(
        function(image) {

          var tmax = image
            .select("tmmx")
            .multiply(0.1);

          var tmin = image
            .select("tmmn")
            .multiply(0.1);

          return tmax
            .add(tmin)
            .divide(2)
            .rename("temp");
        }
      )

      .mean()

      .rename("temp_annual");


      return precipitation

        .addBands(climateAET)

        .addBands(climatePET)

        .addBands(TC_ETPET)

        .addBands(PDSI)

        .addBands(temperature)

        .clip(aoi)

        .set("year", year)

        .set(
          "system:time_start",
          ee.Date.fromYMD(
            year,
            7,
            1
          ).millis()
        );
    })
  );
}


// ======================================================================
// 10. MOD09A1 MNDWI 和水体频率
// ======================================================================

function prepareMOD09MNDWI(image) {

  var stateQA = image.select("StateQA");


  // Bits 0–1：cloud state。
  var cloudState = stateQA
    .bitwiseAnd(3);


  // Bit 2：cloud shadow。
  var cloudShadow = stateQA
    .rightShift(2)
    .bitwiseAnd(1);


  // Bits 8–9：cirrus。
  var cirrus = stateQA
    .rightShift(8)
    .bitwiseAnd(3);


  var qualityMask = cloudState.eq(0)

    .and(
      cloudShadow.eq(0)
    )

    .and(
      cirrus.lte(1)
    );


  var green = image
    .select("sur_refl_b04")
    .multiply(0.0001);


  var swir1 = image
    .select("sur_refl_b06")
    .multiply(0.0001);


  var reflectanceMask = green.gte(-0.2)

    .and(green.lte(1.6))

    .and(swir1.gte(-0.2))

    .and(swir1.lte(1.6));


  return green

    .subtract(swir1)

    .divide(
      green.add(swir1).add(0.0001)
    )

    .rename("MNDWI")

    .updateMask(qualityMask)

    .updateMask(reflectanceMask)

    .copyProperties(
      image,
      ["system:time_start"]
    );
}


function buildAnnualWater(
  startYear,
  endYear
) {

  var years = ee.List.sequence(
    startYear,
    endYear
  );


  var collection = MOD09

    .filterDate(
      ee.Date.fromYMD(startYear, 1, 1),
      ee.Date.fromYMD(endYear + 1, 1, 1)
    )

    .map(prepareMOD09MNDWI);


  return ee.ImageCollection.fromImages(

    years.map(function(year) {

      year = ee.Number(year);

      var start = ee.Date.fromYMD(
        year,
        1,
        1
      );

      var end = start.advance(
        1,
        "year"
      );

      var yearly = collection.filterDate(
        start,
        end
      );


      var annualMNDWI = yearly

        .mean()

        .rename("MNDWI_annual_mean");


      var annualWaterFrequency = yearly.map(
        function(image) {

          return image

            .gt(MNDWI_WATER_THRESHOLD)

            .rename("water");
        }
      )

      .mean()

      .rename("water_frequency_annual");


      return annualMNDWI

        .addBands(
          annualWaterFrequency
        )

        .clip(aoi)

        .set("year", year)

        .set(
          "system:time_start",
          ee.Date.fromYMD(
            year,
            7,
            1
          ).millis()
        );
    })
  );
}


// 距二值水体掩膜的距离。
function distanceFromBinaryMask(
  binaryMask,
  outputName
) {

  return binaryMask

    .unmask(0)

    .fastDistanceTransform(
      DISTANCE_SEARCH_PIXELS
    )

    .sqrt()

    .multiply(
      APPROX_MOD09_PIXEL_METERS
    )

    .clamp(
      0,
      MAX_DISTANCE_METERS
    )

    .rename(outputName)

    .clip(aoi)

    .toFloat();
}


// ======================================================================
// 11. MCD12Q1 时期土地覆盖比例
// ======================================================================

function transformAnnualLandCover(image) {

  var lc = image.select("LC_Type1");


  // IGBP 1–5：森林。
  var forest = lc.gte(1)

    .and(
      lc.lte(5)
    )

    .rename("forest_frac");


  // IGBP 6–10：灌丛、稀树草原和草地。
  var grassShrub = lc.gte(6)

    .and(
      lc.lte(10)
    )

    .rename("grass_shrub_frac");


  // IGBP 12和14：耕地。
  var cropland = lc.eq(12)

    .or(
      lc.eq(14)
    )

    .rename("cropland_frac");


  // IGBP 13：建成区。
  var built = lc.eq(13)
    .rename("built_frac");


  // IGBP 16：裸地。
  var bare = lc.eq(16)
    .rename("bare_frac");


  // IGBP 11和17：湿地和水体。
  var waterWetland = lc.eq(11)

    .or(
      lc.eq(17)
    )

    .rename("water_wetland_frac");


  return ee.Image.cat([

    forest,

    grassShrub,

    cropland,

    built,

    bare,

    waterWetland
  ])

  .toFloat()

  .copyProperties(
    image,
    ["system:time_start"]
  );
}


function buildPeriodLandCover(
  startYear,
  endYear
) {

  var collection = MCD12

    .filterDate(
      ee.Date.fromYMD(startYear, 1, 1),
      ee.Date.fromYMD(endYear + 1, 1, 1)
    )

    .map(transformAnnualLandCover);


  // 多年二值图均值，表示时期内被识别为该类型的年份比例。
  var fractions = collection

    .mean()

    .select([
      "forest_frac",
      "grass_shrub_frac",
      "cropland_frac",
      "built_frac",
      "bare_frac",
      "water_wetland_frac"
    ])

    .clip(aoi)

    .toFloat();


  var yearCount = collection

    .select("forest_frac")

    .count()

    .rename("LC_year_count")

    .clip(aoi)

    .toFloat();


  return {

    fractions: fractions,

    yearCount: yearCount
  };
}


// ======================================================================
// 12. 预计算五期 raw retention 和统一 pooled median
// ======================================================================

var RETENTION_CACHE = {};

var pooledRetentionSamples =
  ee.FeatureCollection([]);


PERIODS.forEach(function(period, index) {

  var retentionObject =
    buildNdviRetentionRaw(
      period.startYear,
      period.endYear
    );


  RETENTION_CACHE[period.id] =
    retentionObject;


  var samples = retentionObject.raw.sample({

    region: aoi,

    scale: RETENTION_SAMPLE_SCALE,

    numPixels: RETENTION_SAMPLE_NUMBER,

    seed: 20261000 + index,

    geometries: false,

    tileScale: 8
  });


  pooledRetentionSamples =
    pooledRetentionSamples.merge(samples);
});


var pooledMedianDictionary =
  pooledRetentionSamples.reduceColumns({

    reducer: ee.Reducer.median(),

    selectors: [
      "NDVI_retention_raw"
    ]
  });


var POOLED_RETENTION_MEDIAN =
  ee.Number(

    ee.Algorithms.If(

      pooledMedianDictionary
        .contains("median"),

      pooledMedianDictionary
        .get("median"),

      1
    )
  );


print(
  "Five-period pooled NDVI retention median:",
  POOLED_RETENTION_MEDIAN
);


// ======================================================================
// 13. 构建单个时期的 predictor 和 QA
// ======================================================================

function buildPeriodPredictors(period) {

  var startYear = period.startYear;
  var endYear = period.endYear;

  var numberOfYears =
    endYear - startYear + 1;


  // --------------------------------------------------------------------
  // 13.1 NDVI
  // --------------------------------------------------------------------

  var annualNDVI =
    buildAnnualGrowingSeasonNDVI(
      startYear,
      endYear
    );


  var NDVI_mean = annualNDVI

    .mean()

    .rename("NDVI_mean");


  var NDVI_max = annualNDVI

    .max()

    .rename("NDVI_max");


  var NDVI_min = annualNDVI

    .min()

    .rename("NDVI_min");


  var NDVI_std = annualNDVI

    .reduce(
      ee.Reducer.stdDev()
    )

    .rename("NDVI_std");


  var NDVI_CV = NDVI_std

    .divide(
      NDVI_mean.abs().add(0.001)
    )

    .clamp(0, 5)

    .rename("NDVI_CV");


  var NDVI_year_count = annualNDVI

    .count()

    .rename("NDVI_year_count")

    .clip(aoi)

    .toFloat();


  // --------------------------------------------------------------------
  // 13.2 NDVI retention
  // --------------------------------------------------------------------

  var retentionObject =
    RETENTION_CACHE[period.id];


  // 五期使用相同的 pooled median 填补。
  var NDVI_retention = retentionObject.raw

    .unmask(
      POOLED_RETENTION_MEDIAN
    )

    .rename("NDVI_retention")

    .clip(aoi)

    .toFloat();


  var retention_valid =
    retentionObject.valid

      .rename("retention_valid")

      .clip(aoi)

      .toFloat();


  // --------------------------------------------------------------------
  // 13.3 TerraClimate 主 ET/PET 和气候变量
  // --------------------------------------------------------------------

  var annualClimate =
    buildAnnualClimate(
      startYear,
      endYear
    );


  // 使用整个时期 AET 总量 / PET 总量。
  var TC_AET_total = annualClimate

    .select("climate_AET_annual")

    .sum();


  var TC_PET_total = annualClimate

    .select("climate_PET_annual")

    .sum();


  var ET_PET = TC_AET_total

    .divide(
      TC_PET_total.add(0.001)
    )

    .updateMask(
      TC_PET_total.gt(0)
    )

    .clamp(0, 2)

    .rename("ET_PET")

    .toFloat();


  var TC_ETPET_year_count =
    annualClimate

      .select("TC_ET_PET_annual")

      .count()

      .rename("TC_ETPET_year_count")

      .clip(aoi)

      .toFloat();


  var precip_mean = annualClimate

    .select("precip_annual")

    .mean()

    .rename("precip_mean");


  var PDSI_mean = annualClimate

    .select("PDSI_annual")

    .mean()

    .rename("PDSI_mean");


  var temp_mean = annualClimate

    .select("temp_annual")

    .mean()

    .rename("temp_mean");


  var precip_total = annualClimate

    .select("precip_annual")

    .sum();


  var Aridity_index = precip_total

    .divide(
      TC_PET_total.add(0.001)
    )

    .updateMask(
      TC_PET_total.gt(0)
    )

    .clamp(0, 3)

    .rename("Aridity_index");


  var climate_year_count =
    annualClimate

      .select("precip_annual")

      .count()

      .rename("climate_year_count")

      .clip(aoi)

      .toFloat();


  // --------------------------------------------------------------------
  // 13.4 MOD16 ET/PET，只用于 QA 和敏感性
  // --------------------------------------------------------------------

  var annualMOD16 =
    buildAnnualMOD16EtPet(
      startYear,
      endYear
    );


  var MOD16_ET_PET = annualMOD16

    .mean()

    .rename("MOD16_ET_PET")

    .clamp(0, 2)

    .toFloat();


  var MOD16_ETPET_year_count =
    annualMOD16

      .count()

      .rename("MOD16_ETPET_year_count")

      .clip(aoi)

      .toFloat();


  // --------------------------------------------------------------------
  // 13.5 MNDWI、水体频率和水体距离
  // --------------------------------------------------------------------

  var annualWater =
    buildAnnualWater(
      startYear,
      endYear
    );


  var MNDWI_mean = annualWater

    .select("MNDWI_annual_mean")

    .mean()

    .rename("MNDWI_mean");


  var water_frequency = annualWater

    .select("water_frequency_annual")

    .mean()

    .clamp(0, 1)

    .rename("water_frequency");


  var MNDWI_year_count = annualWater

    .select("MNDWI_annual_mean")

    .count()

    .rename("MNDWI_year_count")

    .clip(aoi)

    .toFloat();


  var persistentWater = water_frequency

    .gte(
      PERSISTENT_WATER_FREQUENCY
    )

    .rename("persistent_water");


  var seasonalOrPersistentWater =
    water_frequency

      .gte(
        SEASONAL_WATER_FREQUENCY
      )

      .rename(
        "seasonal_or_persistent_water"
      );


  var dist_persistent_water =
    distanceFromBinaryMask(

      persistentWater,

      "dist_persistent_water"
    );


  var dist_seasonal_water =
    distanceFromBinaryMask(

      seasonalOrPersistentWater,

      "dist_seasonal_water"
    );


  // --------------------------------------------------------------------
  // 13.6 时期土地覆盖比例
  // --------------------------------------------------------------------

  var landCoverObject =
    buildPeriodLandCover(
      startYear,
      endYear
    );


  var landCoverFractions =
    landCoverObject.fractions;


  var LC_year_count =
    landCoverObject.yearCount;


  // --------------------------------------------------------------------
  // 13.7 构建原始 predictor stack
  // --------------------------------------------------------------------

  var predictorRaw = ee.Image.cat([

    NDVI_mean,

    NDVI_max,

    NDVI_min,

    NDVI_CV,

    NDVI_retention,

    retention_valid,

    ET_PET,

    MNDWI_mean,

    water_frequency,

    dist_persistent_water,

    dist_seasonal_water,

    PDSI_mean,

    precip_mean,

    temp_mean,

    Aridity_index,

    elevation,

    slope,

    HAND,

    landCoverFractions
  ])

  .select(PREDICTOR_BANDS)

  .clip(aoi)

  .toFloat();


  // 检查最终24个波段本身是否均有有效值。
  var nativePredictorValid =
    predictorRaw

      .mask()

      .reduce(
        ee.Reducer.min()
      )

      .unmask(0)

      .rename(
        "native_predictor_valid"
      )

      .clip(aoi)

      .toByte();


  var minimumThreeYears =
    Math.min(
      3,
      numberOfYears
    );


  var minimumTwoYears =
    Math.min(
      2,
      numberOfYears
    );


  // MOD16不再进入有效域判断。
  var modelValid = NDVI_year_count

    .gte(minimumThreeYears)

    .and(
      MNDWI_year_count
        .gte(minimumTwoYears)
    )

    .and(
      climate_year_count
        .gte(minimumThreeYears)
    )

    .and(
      TC_ETPET_year_count
        .gte(minimumThreeYears)
    )

    .and(
      LC_year_count.gte(1)
    )

    .and(
      nativePredictorValid.eq(1)
    )

    .rename("model_valid")

    .updateMask(aoiMask)

    .toByte();


  var predictors = predictorRaw

    .updateMask(
      modelValid.eq(1)
    )

    .set(
      "period_id",
      period.id
    )

    .set(
      "period_label",
      period.label
    )

    .set(
      "start_year",
      startYear
    )

    .set(
      "end_year",
      endYear
    )

    .set(
      "midpoint_year",
      period.midpoint
    )

    .set(
      "period_year_count",
      numberOfYears
    )

    .set(
      "pooled_retention_median",
      POOLED_RETENTION_MEDIAN
    );


  // --------------------------------------------------------------------
  // 13.8 QA stack
  // --------------------------------------------------------------------

  var qa = ee.Image.cat([

    NDVI_year_count,

    retentionObject
      .droughtCount,

    retentionObject
      .nondroughtCount,

    retention_valid
      .rename(
        "retention_valid_QA"
      ),

    TC_ETPET_year_count,

    MOD16_ET_PET,

    MOD16_ETPET_year_count,

    MNDWI_year_count,

    climate_year_count,

    LC_year_count,

    nativePredictorValid,

    modelValid
  ])

  .select(QA_BANDS)

  .clip(aoi)

  .toFloat()

  .set(
    "period_id",
    period.id
  )

  .set(
    "period_label",
    period.label
  )

  .set(
    "start_year",
    startYear
  )

  .set(
    "end_year",
    endYear
  )

  .set(
    "midpoint_year",
    period.midpoint
  )

  .set(
    "pooled_retention_median",
    POOLED_RETENTION_MEDIAN
  );


  return {

    predictors: predictors,

    qa: qa,

    modelValid: modelValid,

    retentionValid: retention_valid,

    mod16Valid:
      MOD16_ETPET_year_count.gt(0)
  };
}


// ======================================================================
// 14. 导出函数
// ======================================================================

function exportPredictorToAsset(
  image,
  periodLabel
) {

  var outputName =
    "MP_PREDICTORS_" +
    periodLabel +
    "_POOLED_V2_1KM";


  Export.image.toAsset({

    image:
      image.select(PREDICTOR_BANDS),

    description:
      outputName,

    assetId:
      OUT_ASSET_ROOT +
      "/" +
      outputName,

    region:
      EXPORT_REGION,

    crs:
      EXPORT_CRS,

    scale:
      EXPORT_SCALE,

    maxPixels:
      1e13,

    pyramidingPolicy: {

      ".default":
        "mean",

      "retention_valid":
        "mode"
    }
  });
}


function exportQaToAsset(
  image,
  periodLabel
) {

  var outputName =
    "MP_PREDICTOR_QA_" +
    periodLabel +
    "_POOLED_V2_1KM";


  Export.image.toAsset({

    image:
      image.select(QA_BANDS),

    description:
      outputName,

    assetId:
      OUT_ASSET_ROOT +
      "/" +
      outputName,

    region:
      EXPORT_REGION,

    crs:
      EXPORT_CRS,

    scale:
      EXPORT_SCALE,

    maxPixels:
      1e13,

    pyramidingPolicy: {

      ".default":
        "mean",

      "retention_valid_QA":
        "mode",

      "native_predictor_valid":
        "mode",

      "model_valid":
        "mode"
    }
  });
}


function exportImageToDrive(
  image,
  outputName,
  folder,
  bandList
) {

  Export.image.toDrive({

    image: image

      .select(bandList)

      .toFloat()

      .unmask({

        value: NODATA,

        sameFootprint: false
      }),

    description:
      outputName,

    folder:
      folder,

    fileNamePrefix:
      outputName,

    region:
      EXPORT_REGION,

    crs:
      EXPORT_CRS,

    scale:
      EXPORT_SCALE,

    maxPixels:
      1e13,

    fileDimensions:
      8192,

    shardSize:
      256,

    fileFormat:
      "GeoTIFF",

    formatOptions: {

      cloudOptimized: true,

      noData: NODATA
    }
  });
}


// ======================================================================
// 15. 构建五期、创建导出任务并统计完整率
// ======================================================================

var RESULTS = {};

var summaryFeatures = [];


var areaKm2 = ee.Image.pixelArea()

  .divide(1e6)

  .rename("area_km2");


var totalArea = ee.Number(

  areaKm2.reduceRegion({

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


PERIODS.forEach(function(period) {

  if (
    PERIOD_IDS_TO_RUN.indexOf(
      period.id
    ) === -1
  ) {

    return;
  }


  print(
    "Building:",
    period.label
  );


  var result =
    buildPeriodPredictors(period);


  RESULTS[period.id] =
    result;


  print(

    period.label +
    " predictor bands:",

    result.predictors
      .bandNames()
  );


  print(

    period.label +
    " QA bands:",

    result.qa
      .bandNames()
  );


  var validArea = ee.Number(

    areaKm2

      .updateMask(
        result.modelValid.eq(1)
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


  var retentionObservedArea =
    ee.Number(

      areaKm2

        .updateMask(

          result.modelValid
            .eq(1)

            .and(
              result.retentionValid
                .eq(1)
            )
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


  var mod16ObservedArea =
    ee.Number(

      areaKm2

        .updateMask(
          result.mod16Valid.eq(1)
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

      total_area_km2:
        totalArea,

      model_valid_area_km2:
        validArea,

      model_valid_fraction:
        validArea.divide(totalArea),

      retention_observed_area_km2:
        retentionObservedArea,

      retention_observed_fraction_of_valid:
        retentionObservedArea
          .divide(validArea),

      MOD16_observed_area_km2:
        mod16ObservedArea,

      MOD16_observed_fraction:
        mod16ObservedArea
          .divide(totalArea),

      pooled_retention_median:
        POOLED_RETENTION_MEDIAN
    })
  );


  if (EXPORT_TO_ASSET) {

    exportPredictorToAsset(

      result.predictors,

      period.label
    );


    exportQaToAsset(

      result.qa,

      period.label
    );
  }


  if (EXPORT_TO_DRIVE) {

    var predictorName =
      "MP_PREDICTORS_" +
      period.label +
      "_POOLED_V2_1KM";


    var qaName =
      "MP_PREDICTOR_QA_" +
      period.label +
      "_POOLED_V2_1KM";


    exportImageToDrive(

      result.predictors,

      predictorName,

      DRIVE_PREDICTOR_FOLDER,

      PREDICTOR_BANDS
    );


    exportImageToDrive(

      result.qa,

      qaName,

      DRIVE_QA_FOLDER,

      QA_BANDS
    );
  }
});


var summary =
  ee.FeatureCollection(
    summaryFeatures
  );


print(
  "POOLED_V2 completeness summary:",
  summary
);


Export.table.toDrive({

  collection:
    summary,

  description:
    "MP_predictor_completeness_summary_pooled_v2",

  folder:
    DRIVE_QA_FOLDER,

  fileNamePrefix:
    "MP_predictor_completeness_summary_pooled_v2",

  fileFormat:
    "CSV"
});


// ======================================================================
// 16. 五期一致性检查
// ======================================================================

if (

  RESULTS.P1 !== undefined &&

  RESULTS.P5 !== undefined
) {

  print(

    "P1/P5 predictor bands identical:",

    ee.Algorithms.IsEqual(

      RESULTS.P1
        .predictors
        .bandNames(),

      RESULTS.P5
        .predictors
        .bandNames()
    )
  );


  print(

    "P1/P5 QA bands identical:",

    ee.Algorithms.IsEqual(

      RESULTS.P1
        .qa
        .bandNames(),

      RESULTS.P5
        .qa
        .bandNames()
    )
  );
}


// ======================================================================
// 17. 地图预览
// ======================================================================

Map.centerObject(
  MP,
  4
);


Map.addLayer(

  ee.Image()
    .byte()
    .paint(
      MP,
      1,
      2
    ),

  {
    palette: [
      "000000"
    ]
  },

  "Mongolian Plateau boundary"
);


if (
  RESULTS.P1 !== undefined
) {

  Map.addLayer(

    RESULTS.P1
      .predictors
      .select("ET_PET"),

    {
      min: 0,
      max: 1,

      palette: [
        "8c510a",
        "d8b365",
        "f6e8c3",
        "c7eae5",
        "5ab4ac",
        "01665e"
      ]
    },

    "P1 TerraClimate AET/PET",

    false
  );


  Map.addLayer(

    RESULTS.P1
      .qa
      .select("MOD16_ET_PET"),

    {
      min: 0,
      max: 1,

      palette: [
        "8c510a",
        "d8b365",
        "f6e8c3",
        "c7eae5",
        "5ab4ac",
        "01665e"
      ]
    },

    "P1 MOD16 ET/PET sensitivity",

    false
  );


  Map.addLayer(

    RESULTS.P1
      .qa
      .select("model_valid")
      .selfMask(),

    {
      palette: [
        "00AA00"
      ]
    },

    "P1 model valid",

    false
  );
}


if (
  RESULTS.P5 !== undefined
) {

  Map.addLayer(

    RESULTS.P5
      .qa
      .select("retention_valid_QA"),

    {
      min: 0,
      max: 1,

      palette: [
        "d73027",
        "1a9850"
      ]
    },

    "P5 retention observed",

    false
  );


  Map.addLayer(

    RESULTS.P5
      .qa
      .select("model_valid")
      .selfMask(),

    {
      palette: [
        "0066FF"
      ]
    },

    "P5 model valid",

    false
  );
}


print(
  "POOLED_V2 predictor tasks created."
);


print(
  "MODEL_BANDS for final pooled RF:",
  MODEL_BANDS
);
