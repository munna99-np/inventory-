import * as React from 'react'
import Box from '@mui/material/Box'
import type { TreeViewBaseItem } from '@mui/x-tree-view/models'
import { RichTreeView } from '@mui/x-tree-view/RichTreeView'

export type CategoryTreeItem = TreeViewBaseItem

export interface CategoryTreeProps {
  items: CategoryTreeItem[]
  defaultExpandedIds?: string[]
  onSelect?: (itemId: string | null) => void
  height?: number
  width?: number
}

export default function CategoryTree({
  items,
  defaultExpandedIds,
  onSelect,
  height = 360,
  width = 280,
}: CategoryTreeProps) {
  const handleSelectedItemsChange = React.useCallback(
    (_event: unknown, itemIds: string[] | string | null) => {
      if (!onSelect) return
      if (Array.isArray(itemIds)) {
        onSelect(itemIds[0] ?? null)
      } else {
        onSelect(itemIds ?? null)
      }
    },
    [onSelect]
  )

  return (
    <Box sx={{ minHeight: height, minWidth: width }}>
      <RichTreeView
        items={items}
        defaultExpandedItems={defaultExpandedIds}
        onSelectedItemsChange={handleSelectedItemsChange}
      />
    </Box>
  )
}


