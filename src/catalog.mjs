export const products = [
  {
    id: "revverb",
    slug: "revverb",
    code: "RVB",
    name: "reVVerb",
    price: 5,
    currency: "EUR",
    fileName: "PunkatRevVerb_macOS_v1.0.1.pkg",
    deliveryMode: "direct_link",
    downloadUrl: "https://www.dropbox.com/scl/fi/o0ouyqs7dvlcwozppv1u6/PunkatRevVerb_macOS_v1.0.1.pkg?rlkey=tic66x67sxi8fa3o7667exbkj&st=0iwc6diu&dl=1",
    active: true,
  },
  {
    id: "surgeq-l5",
    slug: "surgeq-l5",
    code: "SL5",
    name: "SurgEQ-L5",
    price: 19,
    currency: "EUR",
    fileName: "PunkatSurgEQ-L5_macOS_v1.0.0.pkg",
    deliveryMode: "direct_link",
    downloadUrl: "https://www.dropbox.com/scl/fo/d1rvxumng64vrdf89vi35/AFu1QMdMptStbw7D4AkXfMg?rlkey=e47tbutwxpq96sw99uq1fpsmr&st=kjohztna&dl=1",
    active: true,
  },
];

export function getProductBySlug(slug) {
  return products.find((product) => product.slug === slug && product.active);
}
