import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useCategories } from '../hooks/useCategories'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog'
import ScopeSelect from '../components/fields/ScopeSelect'
import { supabase } from '../lib/supabaseClient'
import type { Category } from '../types/categories'
import { IconCategories } from '../components/icons'
import { ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'

type TreeNode = Category & { children: TreeNode[] }

type DialogState =
  | { mode: 'create'; parentId: string | null }
  | { mode: 'edit'; category: Category }
  | null

export default function CategoriesPage() {
  const [scope, setScope] = useState<'personal' | 'work'>('personal')
  const { data, error, refetch } = useCategories(scope)
  const categories = data ?? []
  const [search, setSearch] = useState('')
  const [dialog, setDialog] = useState<DialogState>(null)
  const [formName, setFormName] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  const tree = useMemo(() => buildTree(categories), [categories])
  const visibleIds = useMemo(
    () => (search.trim() ? collectVisibleIds(tree, search.trim().toLowerCase()) : null),
    [tree, search]
  )
  const nameById = useMemo(() => {
    const map = new Map<string, string>()
    categories.forEach((category) => map.set(category.id, category.name))
    return map
  }, [categories])

  const toggleNode = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const renderRows = (nodes: TreeNode[], depth = 0): JSX.Element[] => {
    return nodes.flatMap((node) => {
      const isVisible = !visibleIds || visibleIds.has(node.id)
      if (!isVisible) return []

      const hasChildren = node.children.length > 0
      const isExpanded = hasChildren && (visibleIds ? visibleIds.has(node.id) : expanded.has(node.id))
      const padding = depth * 20
      const parentName = node.parent_id ? nameById.get(node.parent_id) ?? '—' : 'Top level'

      const row = (
        <tr
          key={node.id}
          className="border-b border-border/70 bg-background/80 text-sm transition hover:bg-muted/30"
        >
          <td className="px-3 py-2">
            <div className="flex items-center gap-2" style={{ paddingLeft: `${padding}px` }}>
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => toggleNode(node.id)}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted/60"
                  aria-label={isExpanded ? 'Collapse category' : 'Expand category'}
                >
                  <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                </button>
              ) : (
                <span className="inline-block h-6 w-6" aria-hidden="true" />
              )}
              <span className="text-sm font-medium text-foreground">{node.name}</span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                {node.scope}
              </span>
            </div>
          </td>
          <td className="px-3 py-2 text-sm text-muted-foreground">{parentName}</td>
          <td className="px-3 py-2 text-right text-sm text-muted-foreground">{node.children.length}</td>
          <td className="px-3 py-2">
            <div className="flex flex-wrap justify-end gap-1">
              <Button variant="ghost" size="sm" onClick={() => startCreate(node.id)}>
                <Plus className="mr-1 h-4 w-4" />
                Add inside
              </Button>
              <Button variant="ghost" size="sm" onClick={() => startEdit(node)}>
                <Pencil className="mr-1 h-4 w-4" />
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700"
                onClick={() => deleteCategory(node)}
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Delete
              </Button>
            </div>
          </td>
        </tr>
      )

      const childRows = isExpanded ? renderRows(node.children, depth + 1) : []
      return [row, ...childRows]
    })
  }

  const tableRows = renderRows(tree)

  function startCreate(parentId: string | null) {
    setFormName('')
    setDialog({ mode: 'create', parentId })
  }

  function startEdit(category: Category) {
    setFormName(category.name)
    setDialog({ mode: 'edit', category })
  }

  const submitDialog = async () => {
    const name = formName.trim()
    if (!name) {
      toast.error('Category name is required')
      return
    }

    const parentIdToOpen = dialog?.mode === 'create' ? dialog.parentId : null

    try {
      if (dialog?.mode === 'create') {
        const payload: Record<string, any> = { name, scope }
        if (dialog.parentId) payload.parent_id = dialog.parentId
        const { error } = await supabase.from('categories').insert(payload)
        if (error) throw error
        toast.success('Category added')
      } else if (dialog?.mode === 'edit') {
        const payload: Record<string, any> = { name }
        const { error } = await supabase
          .from('categories')
          .update(payload)
          .eq('id', dialog.category.id)
        if (error) throw error
        toast.success('Category updated')
      }
      setDialog(null)
      setFormName('')
      await refetch()
      if (parentIdToOpen) {
        setExpanded((prev) => {
          const next = new Set(prev)
          next.add(parentIdToOpen)
          return next
        })
      }
    } catch (err: any) {
      toast.error(err.message ?? 'Operation failed')
    }
  }

  async function deleteCategory(category: Category) {
    if (!window.confirm(`Delete category "${category.name}"? Nested categories must be reassigned.`)) return
    try {
      const { error } = await supabase.from('categories').delete().eq('id', category.id)
      if (error) throw error
      toast.success('Category removed')
      await refetch()
    } catch (err: any) {
      if (/foreign key|violates/.test(err.message ?? '')) {
        toast.error('Cannot delete: category is still used by transactions or children')
        return
      }
      toast.error(err.message ?? 'Failed to delete category')
    }
  }
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xl font-semibold">
          <IconCategories size={20} className="text-primary" />
          Category Architect
        </div>
        <div className="flex items-center gap-2">
          <Input
            className="h-9 w-48"
            placeholder="Search categories"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <ScopeSelect
            value={scope}
            onValueChange={(value) => {
              setScope(value)
              setSearch('')
              setExpanded(new Set<string>())
            }}
            className="w-40"
          />
          <Button onClick={() => startCreate(null)}>New parent category</Button>
        </div>
      </header>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div> : null}

      <Card className="border border-border/70">
        <CardHeader>
          <CardTitle className="text-lg">Category hierarchy ({scope})</CardTitle>
          <p className="text-sm text-muted-foreground">Build multi-level parents, categories, and sub-categories. Add as many levels as you need.</p>
        </CardHeader>
        <CardContent>
          {tree.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
              No categories yet. Start by creating a parent category.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border/70">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Category</th>
                    <th className="px-3 py-2 text-left font-semibold">Parent</th>
                    <th className="px-3 py-2 text-right font-semibold">Children</th>
                    <th className="px-3 py-2 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.length > 0 ? (
                    tableRows
                  ) : (
                    <tr>
                      <td className="px-4 py-6 text-center text-sm text-muted-foreground" colSpan={4}>
                        {search.trim() ? 'No categories match your search.' : 'No categories to display.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {dialog ? (
        <CategoryDialog
          mode={dialog.mode}
          isOpen={!!dialog}
          parentName={
            dialog.mode === 'create' && dialog.parentId ? nameById.get(dialog.parentId) ?? undefined : undefined
          }
          formName={formName}
          onNameChange={setFormName}
          onClose={() => { setDialog(null); setFormName('') }}
          onSubmit={submitDialog}
        />
      ) : null}
    </div>
  )
}

type CategoryDialogProps = {
  mode: 'create' | 'edit'
  isOpen: boolean
  parentName?: string
  formName: string
  onNameChange: (value: string) => void
  onClose: () => void
  onSubmit: () => void
}

function CategoryDialog({ mode, isOpen, parentName, formName, onNameChange, onClose, onSubmit }: CategoryDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(value) => (value ? undefined : onClose())}>
      <DialogContent className="max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <DialogTitle className="text-lg font-semibold">
          {mode === 'create' ? (parentName ? `Add child inside ${parentName}` : 'Create parent category') : 'Rename category'}
        </DialogTitle>
        {parentName ? <p className="text-xs text-muted-foreground">Parent: {parentName}</p> : null}
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Category name</label>
            <Input value={formName} onChange={(event) => onNameChange(event.target.value)} className="mt-1 h-11" placeholder="e.g. Materials" />
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit}>{mode === 'create' ? 'Create' : 'Save'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function buildTree(categories: Category[]): TreeNode[] {
  const lookups = new Map<string, TreeNode>()
  categories.forEach((category) => {
    lookups.set(category.id, { ...category, children: [] })
  })

  const roots: TreeNode[] = []
  lookups.forEach((node) => {
    if (node.parent_id && lookups.has(node.parent_id)) {
      lookups.get(node.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  })

  const sortTree = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name))
    nodes.forEach((child) => sortTree(child.children))
  }

  sortTree(roots)
  return roots
}

function collectVisibleIds(tree: TreeNode[], term: string): Set<string> {
  const visible = new Set<string>()

  const visit = (node: TreeNode, ancestors: string[]) => {
    const matches = node.name.toLowerCase().includes(term)
    const descendantMatches = node.children.some((child) => visit(child, [...ancestors, node.id]))
    if (matches || descendantMatches) {
      visible.add(node.id)
      ancestors.forEach((ancestorId) => visible.add(ancestorId))
      return true
    }
    return false
  }

  tree.forEach((node) => visit(node, []))
  return visible
}
