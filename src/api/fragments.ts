// GraphQL Fragments for Vendure Shop API

export const PRODUCT_CARD_FRAGMENT = `
    fragment ProductCard on SearchResult {
        productId
        productName
        slug
        productAsset { id preview }
        priceWithTax {
            ... on SinglePrice { value }
            ... on PriceRange { min max }
        }
        currencyCode
    }
`;

export const PRODUCT_DETAIL_FRAGMENT = `
    fragment ProductDetail on Product {
        id name slug description
        assets { id preview source }
        variants {
            id name priceWithTax currencyCode stockLevel
            options { id name code }
        }
        optionGroups { id name code options { id name code } }
        facetValues { id name facet { id name } }
        collections { id name slug }
    }
`;

export const ORDER_FRAGMENT = `
    fragment OrderDetail on Order {
        id code state active totalQuantity
        subTotalWithTax totalWithTax shippingWithTax
        taxSummary { description taxRate taxTotal }
        currencyCode createdAt updatedAt
        lines {
            id quantity linePriceWithTax unitPriceWithTax
            featuredAsset { preview }
            productVariant { id name options { name value } }
        }
        shippingAddress { fullName streetLine1 streetLine2 city province postalCode country phoneNumber }
        billingAddress { fullName streetLine1 streetLine2 city province postalCode country phoneNumber }
        shippingLines { shippingMethod { id name code } priceWithTax }
        payments { id method amount state transactionId metadata }
        couponCodes
        discounts { description amountWithTax }
    }
`;

export const CART_FRAGMENT = `
    fragment CartInfo on Order {
        id code active totalQuantity
        subTotalWithTax totalWithTax currencyCode
        lines {
            id quantity linePriceWithTax unitPriceWithTax
            featuredAsset { preview }
            productVariant { id name options { name value } }
        }
        couponCodes
        discounts { description amountWithTax }
    }
`;