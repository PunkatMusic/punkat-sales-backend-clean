export const products = [
  {
    id: "revverb",
    slug: "revverb",
    code: "RVB",
    name: "reVVerb",
    price: 5,
    currency: "EUR",
    fileName: "reVVerb-macOS.zip",
    deliveryMode: "direct_link",
    downloadUrl: "https://www.dropbox.com/scl/fo/wz5ict6ctowjr55mya1pt/ACrODQs6EYPVRhgv2esxo4E?rlkey=q3stytfr340tyum7mza8i7ohr&st=4dbkr8s7&dl=1",
    active: true,
  },
  {
    id: "surgeq-l5",
    slug: "surgeq-l5",
    code: "SL5",
    name: "SurgEQ-L5",
    price: 79,
    currency: "EUR",
    fileName: "SurgEQ-L5-macOS.zip",
    deliveryMode: "protected_download",
    active: true,
  },
];

export function getProductBySlug(slug) {
  return products.find((product) => product.slug === slug && product.active);
}
