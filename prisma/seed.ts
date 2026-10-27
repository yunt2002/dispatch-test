import { PrismaClient } from "../src/generated/prisma";
import { PRODUCT_FAMILIES } from "../src/lib/product-loading";

const prisma = new PrismaClient();

const VEHICLE_IDS = {
  v1: "vehicle-1ho-4t",
  v2: "vehicle-2ho-3-5t",
  v3: "vehicle-3ho-2-5t",
  staria: "vehicle-staria",
};

/** 잠정 지역 목록 — TODO: 실무자 확인 필요 (isConfirmed=false) */
const METROPOLITAN = [
  "서울",
  "인천",
  "경기",
  "평택",
  "세종",
  "아산",
  "화성",
  "안산",
  "안양",
  "판교",
  "김포",
  "인천공항",
  "음성",
  "충주",
  "청주",
  "서산",
  "예산",
];

const LOCAL = [
  "광주",
  "창원",
  "김해",
  "울주",
  "부산",
  "부산항",
  "진해항",
  "대구",
  "거창",
  "완주",
];

/** 공통/유동 — 잔여 PLT·동선으로 1·2호 (시드에서는 수도권 선호 해제, notes로 표시) */
const FLEX = ["세종", "아산"];

async function main() {
  await prisma.appLog.deleteMany();
  await prisma.dispatchGroup.deleteMany();
  await prisma.dispatchResult.deleteMany();
  await prisma.shipment.deleteMany();
  await prisma.planSession.deleteMany();
  await prisma.routeCustomer.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.product.deleteMany();
  await prisma.productLoadingMaster.deleteMany();
  await prisma.regionMaster.deleteMany();
  await prisma.route.deleteMany();
  await prisma.vehicleType.deleteMany();
  await prisma.appSetting.deleteMany();

  await prisma.appSetting.createMany({
    data: [
      { key: "cost_method", value: "fixed" },
      { key: "data_mode", value: "excel_first" },
      { key: "kg_per_pallet", value: "600" },
      { key: "kg_per_pallet_confirmed", value: "true" },
    ],
  });

  await prisma.vehicleType.createMany({
    data: [
      {
        id: VEHICLE_IDS.v1,
        vehicleName: "1호차",
        maxWeight: 4000,
        maxPallet: 8,
        primaryRegionType: "LOCAL",
        priorityType: "NORMAL",
        boxPreferred: false,
        description:
          "4.0t 윙바디 · 적재함 5,200×2,300 · 최대 8 PLT · 지방·고정 루트. 600kg/PLT 기준.",
        isDummy: false,
      },
      {
        id: VEHICLE_IDS.v2,
        vehicleName: "2호차",
        maxWeight: 3500,
        maxPallet: 8,
        primaryRegionType: "METROPOLITAN",
        priorityType: "NORMAL",
        boxPreferred: false,
        description:
          "3.5t 윙바디 · 적재함 5,000×2,150 · 최대 8 PLT · 수도권·유동. 600kg/PLT 기준.",
        isDummy: false,
      },
      {
        id: VEHICLE_IDS.v3,
        vehicleName: "3호차",
        maxWeight: 2500,
        maxPallet: 2,
        primaryRegionType: "EMERGENCY",
        priorityType: "EMERGENCY",
        boxPreferred: false,
        description: "2.5t · 급할 때 사용. 2PLT.",
        isDummy: false,
      },
      {
        id: VEHICLE_IDS.staria,
        vehicleName: "스타리아",
        maxWeight: 1000,
        maxPallet: 1,
        primaryRegionType: "EMERGENCY",
        priorityType: "EMERGENCY",
        boxPreferred: true,
        description: "긴급납품. 최대 1PLT · 가능하면 박스 단위 적재 우선.",
        isDummy: false,
      },
    ],
  });

  const metroOnly = METROPOLITAN.filter((name) => !FLEX.includes(name));
  await prisma.regionMaster.createMany({
    data: [
      ...metroOnly.map((locationName) => ({
        locationName,
        regionType: "METROPOLITAN",
        preferredVehicleTypeId: VEHICLE_IDS.v2,
        notes: "수도권 · 2호차 기본",
        isConfirmed: false,
      })),
      ...FLEX.map((locationName) => ({
        locationName,
        regionType: "METROPOLITAN",
        preferredVehicleTypeId: null,
        notes: "공통/유동 권역 — 잔여 PLT·동선으로 1호 또는 2호",
        isConfirmed: false,
      })),
      ...LOCAL.map((locationName) => ({
        locationName,
        regionType: "LOCAL",
        preferredVehicleTypeId: VEHICLE_IDS.v1,
        notes: "지방 고정 루트 · 1호차 기본",
        isConfirmed: false,
      })),
    ],
  });

  // 현장 적재표 — P 접이식박스는 P 박스로 저장
  await prisma.productLoadingMaster.createMany({
    data: PRODUCT_FAMILIES.map((family) => ({
      productCode: family.id,
      productName: family.familyName,
      boxesPerPallet: family.boxesPerPallet,
      specialLoadingRule: JSON.stringify({
        boxType: family.boxType,
        boxTypeRaw: family.boxTypeRaw,
        palletSpec: family.palletSpec,
        loose: family.boxesPerPallet == null,
        customers: family.customers,
      }),
    })),
  });

  await prisma.route.createMany({
    data: [
      {
        id: "route-local",
        routeCode: "R-LOCAL",
        routeName: "지방납품",
        preferredVehicleTypeId: VEHICLE_IDS.v1,
        description: "레거시 보조 루트",
      },
      {
        id: "route-capital",
        routeCode: "R-CAPITAL",
        routeName: "수도권납품",
        preferredVehicleTypeId: VEHICLE_IDS.v2,
        description: "레거시 보조 루트",
      },
      {
        id: "route-express",
        routeCode: "R-EXPRESS",
        routeName: "긴급/소량",
        preferredVehicleTypeId: VEHICLE_IDS.staria,
      },
      {
        id: "route-charter",
        routeCode: "R-CHARTER",
        routeName: "용차",
      },
      {
        id: "route-courier",
        routeCode: "R-COURIER",
        routeName: "경동택배 등",
      },
      {
        id: "route-other",
        routeCode: "R-OTHER",
        routeName: "기타/미분류",
      },
    ],
  });

  console.log(
    JSON.stringify(
      {
        vehicles: 4,
        regions: METROPOLITAN.length + LOCAL.length,
        productLoadingMasters: PRODUCT_FAMILIES.length,
        note: "Product families from ops loading table; P folding boxes stored as P boxes",
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
