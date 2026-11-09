// Public API of the catalog module. Other code may import only this file.
export {
  ITEM_TYPES,
  readCatalog,
  catalogItem,
  type Catalog,
  type CatalogItem,
  type CatalogOption,
  type Dimension,
  type DimensionName,
  type InvalidCombination,
  type ItemType,
  type SourcedLength,
} from './model/catalog';
export { CURRENT_CATALOG, catalogVersion } from './model/current';
export { CATALOG_CHECKS, catalogItemCheck, checkPlacement, type ItemPlacement } from './model/checks';
