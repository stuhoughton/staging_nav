/**
 * Trimmed JD Williams `nav` fixture for use across tests.
 *
 * This is synthetic sample data shaped like the public JD Williams `/api/layout`
 * `nav` array. It contains only public storefront navigation structure — no
 * customer PII. It exercises the full three-level nesting (bar → group → group →
 * leaf) plus top-level leaves, so the renderer and converter can be tested
 * against a realistic but compact tree.
 */
import type { NavNode } from "../data/types";

export const jdWilliamsNavFixture: NavNode[] = [
  {
    title: "Womens",
    urlPath: "/shop/c/womens",
    type: "G",
    seoPath: "/womens",
    iconUrlPath: "nav-womens",
    navigationNode: [
      {
        title: "Shop by Category",
        urlPath: "/shop/c/womens/categories",
        type: "G",
        seoPath: "/womens/shop-by-category",
        navigationNode: [
          {
            title: "Dresses",
            urlPath: "/shop/c/womens/dresses",
            type: "L",
            seoPath: "/womens/shop-by-category/dresses",
          },
          {
            title: "Tops",
            urlPath: "/shop/c/womens/tops",
            type: "L",
            seoPath: "/womens/shop-by-category/tops",
          },
          {
            title: "Knitwear",
            urlPath: "/shop/c/womens/knitwear",
            type: "L",
            seoPath: "/womens/shop-by-category/knitwear",
          },
        ],
      },
      {
        title: "Lingerie",
        urlPath: "/shop/c/womens/lingerie",
        type: "L",
        seoPath: "/womens/lingerie",
        altText: "Womens lingerie",
      },
    ],
  },
  {
    title: "Mens",
    urlPath: "/shop/c/mens",
    type: "G",
    seoPath: "/mens",
    iconUrlPath: "nav-mens",
    navigationNode: [
      {
        title: "Shop by Category",
        urlPath: "/shop/c/mens/categories",
        type: "G",
        seoPath: "/mens/shop-by-category",
        navigationNode: [
          {
            title: "Shirts",
            urlPath: "/shop/c/mens/shirts",
            type: "L",
            seoPath: "/mens/shop-by-category/shirts",
          },
          {
            title: "Trousers",
            urlPath: "/shop/c/mens/trousers",
            type: "L",
            seoPath: "/mens/shop-by-category/trousers",
          },
        ],
      },
    ],
  },
  {
    title: "Home & Gifts",
    urlPath: "/shop/c/home",
    type: "G",
    seoPath: "/home-and-gifts",
    navigationNode: [
      {
        title: "Bedding",
        urlPath: "/shop/c/home/bedding",
        type: "L",
        seoPath: "/home-and-gifts/bedding",
      },
    ],
  },
  {
    title: "Sale",
    urlPath: "/shop/c/sale",
    type: "L",
    seoPath: "/sale",
    iconUrlPath: "nav-sale",
  },
];
