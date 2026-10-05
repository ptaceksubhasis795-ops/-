const products = [
  {
    id: "p-dan-nan-xing",
    category: "prescription",
    name: "胆南星直服饮片",
    subtitle: "凭有效处方购买 · 直服不煎煮",
    description: "精选道地原料，按规格计价。购买前需绑定就诊人并提交有效处方。",
    price: 128,
    originalPrice: 158,
    unit: "10g × 10袋",
    stock: 96,
    badge: "处方商品",
    color: "#E6F4F1",
    image: "/assets/products/dan-nan-xing-default.webp",
    overlay: "/assets/overlays/botanical-linework.webp",
    reward: "按品种奖励清单"
  },
  {
    id: "p-shang-lu-guo",
    category: "prescription",
    name: "商陆果直服饮片",
    subtitle: "凭有效处方购买 · 规格可选",
    description: "后台按批号与有效期管理库存，实际可购规格以处方和库存为准。",
    price: 98,
    originalPrice: 118,
    unit: "10g × 10袋",
    stock: 42,
    badge: "处方商品",
    color: "#EEF5E8",
    image: "/assets/products/shang-lu-guo-default.webp",
    overlay: "/assets/overlays/botanical-linework.webp",
    reward: "按品种奖励清单"
  },
  {
    id: "p-jujube-tea",
    category: "daily",
    name: "草本轻养茶",
    subtitle: "日常饮用 · 清爽无负担",
    description: "药食同源原料，独立小袋包装，适合办公室与居家饮用。",
    price: 69,
    originalPrice: 89,
    unit: "5g × 20袋",
    stock: 238,
    badge: "药食同源",
    color: "#FFF2E3",
    image: "/assets/products/jujube-tea-default.webp",
    overlay: "/assets/overlays/amber-orbit.webp",
    reward: "普通会员 6%"
  },
  {
    id: "p-millet-protein",
    category: "daily",
    name: "谷物营养粉",
    subtitle: "早餐营养 · 独立分装",
    description: "谷物与植物蛋白组合，冲调方便。本品不能代替药物。",
    price: 89,
    originalPrice: 109,
    unit: "30g × 15袋",
    stock: 152,
    badge: "热销",
    color: "#FFF6DA",
    image: "/assets/products/millet-protein-default.webp",
    overlay: "/assets/overlays/amber-orbit.webp",
    reward: "普通会员 5%"
  },
  {
    id: "p-herbal-foot-bath",
    category: "daily",
    name: "四季草本足浴包",
    subtitle: "草本配方 · 一包一用",
    description: "草本足浴包，密封包装，使用前请阅读产品说明。",
    price: 49,
    originalPrice: 59,
    unit: "30g × 10包",
    stock: 310,
    badge: "新品",
    color: "#F3ECF7",
    image: "/assets/products/foot-bath-default.webp",
    overlay: "/assets/overlays/botanical-linework.webp",
    reward: "暂不参与"
  }
]

const articles = [
  {
    id: "a-01",
    tag: "daily-health",
    category: "daily-health",
    title: "日常健康管理，从记录开始",
    summary: "把每一次购买、每一条健康信息都整理好，后续服务才有连续性。",
    body: "健康管理不只是一次购买。记录就诊人、过敏史和日常关注方向，可以帮助后续服务更准确。填写健康信息前，请先阅读并同意授权说明。",
    recommended: true
  },
  {
    id: "a-02",
    tag: "prescription-guide",
    category: "prescription-guide",
    title: "处方饮片购买流程说明",
    summary: "取得有效处方后，再进行确认和支付。",
    body: "处方商品需要绑定实名就诊人。互联网医院处方会进入我的处方；线下处方需要上传图片并由药师审核。审核通过且处方在有效期内，才会显示支付入口。",
    recommended: false
  },
  {
    id: "a-03",
    tag: "daily-health",
    category: "daily-health",
    title: "把一日三餐做得更简单",
    summary: "从可持续的小习惯开始，给自己留出稳定的节奏。",
    body: "选择适合自己的食材和作息，保持记录，必要时咨询专业人士。产品信息以商品详情和包装说明为准。"
  }
]

const banners = [
  { id: "banner-01", title: "秋季轻养计划", subtitle: "把日常健康，交给长期记录", tone: "teal", image: "/assets/banners/daily-care.webp", overlay: "/assets/overlays/botanical-linework.webp", mode: "default", sort: 1, active: true },
  { id: "banner-02", title: "处方饮片服务", subtitle: "有效处方 · 药师审核 · 直服不煎煮", tone: "amber", image: "/assets/banners/prescription-care.webp", overlay: "/assets/overlays/amber-orbit.webp", mode: "default", sort: 2, active: true }
]

const defaultState = {
  user: {
    id: "u-demo",
    nickname: "体验用户",
    phone: "138****2048",
    memberStatus: "ordinary",
    promoterStatus: "none",
    rewardBalance: 268.5,
    customerCount: 6
  },
  patients: [
    { id: "patient-01", name: "李女士", idNo: "110***********2321", phone: "138****2048", relation: "本人", allergies: "暂无", history: "" }
  ],
  addresses: [
    { id: "address-01", name: "李女士", phone: "138****2048", detail: "广东省广州市天河区体育西路 88 号", isDefault: true }
  ],
  cart: [],
  orders: [],
  prescriptions: [
    { id: "rx-demo", patientName: "李女士", source: "线下处方", status: "approved", statusText: "审核通过", validUntil: "2026-10-08", itemName: "胆南星直服饮片", amount: 128, canPay: true }
  ],
  memberApplication: null,
  articles,
  banners,
  notifications: [
    { id: "n-01", title: "欢迎使用九转健康商城", text: "当前为模拟数据模式，支付和第三方接口不会产生真实扣款。", time: "刚刚", read: false }
  ],
  commission: [
    { id: "c-01", source: "草本轻养茶 × 2", amount: 8.28, status: "可结算", date: "2026-09-27" },
    { id: "c-02", source: "谷物营养粉 × 1", amount: 5.34, status: "待生效", date: "2026-09-26" }
  ]
}

module.exports = { products, articles, banners, defaultState }
