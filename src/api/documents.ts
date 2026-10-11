/** shop-api 文档（与 vendure diy-plugin shopSchema 对齐） */
export const DIY_CATEGORIES_QUERY = `
  query { diyCategories { id code name } }
`

export const DIY_MATERIALS_QUERY = `
  query($take: Int) {
    diyMaterials(filter: { onlyEnabled: true, take: $take }) {
      total
      items { id code name categoryId shape diameter axialLength holeSize attrs render price currency stock }
    }
  }
`
