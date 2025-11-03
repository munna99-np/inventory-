import { useEffect, useState } from 'react'
import InventoryNav from '../features/inventory/InventoryNav'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { usePartySearch } from '../hooks/useInventory'
import { listPurchases, getPurchaseDetails, getPurchaseHistory, getPartyPurchaseHistory } from '../services/inventoryItems'
import { formatCurrency } from '../lib/format'
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog'
import { toast } from 'sonner'
import { useInvCategories, useInvSubcategories } from '../hooks/useInventory'
import PurchaseForm from '../features/inventory/PurchaseForm'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'

export default function InventoryPurchasesPage() {
  const { data: categories } = useInvCategories()
  const [catId, setCatId] = useState<string | undefined>(undefined)
  const { data: subs } = useInvSubcategories(catId)
  const [subId, setSubId] = useState<string | undefined>(undefined)
  useEffect(() => { setSubId(undefined) }, [catId])

  // Global search controls both party list and items list
  const [search, setSearch] = useState('')
  // Listen to global search from topbar
  useEffect(() => {
    const handler = (e: any) => setSearch(e?.detail?.query ?? '')
    window.addEventListener('app:search', handler as any)
    return () => window.removeEventListener('app:search', handler as any)
  }, [])
  const { data: parties } = usePartySearch(search)
  const [partyId, setPartyId] = useState('')
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [openDetails, setOpenDetails] = useState<string | null>(null)
  const [lines, setLines] = useState<any[]>([])
  const [openItemHistory, setOpenItemHistory] = useState(false)
  const [openPartyHistory, setOpenPartyHistory] = useState(false)
  const [historyLines, setHistoryLines] = useState<any[]>([])
  const [itemId, setItemId] = useState<string>('')
  const [items, setItems] = useState<any[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)

  useEffect(() => {
    const run = async () => {
      if (!partyId) { setHistory([]); return }
      setLoading(true)
      try { setHistory(await listPurchases({ partyId })) } finally { setLoading(false) }
    }
    run()
  }, [partyId])

  // Load items for subcategory OR entire category if sub not selected
  useEffect(() => {
    let active = true
    ;(async () => {
      setItemsLoading(true)
      try {
        // If subcategory is selected, fetch items for that subcategory
        if (subId) {
          const mod = await import('../services/inventoryItems')
          const rows = await mod.listItems(subId)
          if (!active) return
          setItems(rows)
          return
        }
        // If category is selected but no subcategory, aggregate items from all subs under the category
        if (catId) {
          const subIds = (subs as any[]).map((s: any) => s.id)
          if (subIds.length === 0) { if (active) setItems([]); return }
          const mod = await import('../services/inventoryItems')
          const lists = await Promise.all(subIds.map((sid) => mod.listItems(sid)))
          if (!active) return
          setItems(lists.flat())
          return
        }
        // No category/sub selected
        if (active) {
          setItems([])
          setItemId('')
        }
      } finally {
        if (active) setItemsLoading(false)
      }
    })()
    return () => { active = false }
  }, [subId, catId, subs])

  return (
    <div className="space-y-4">
      <InventoryNav />

      <div className="border rounded-md p-3">
        <h3 className="text-sm font-medium mb-2">New Purchase</h3>
        <PurchaseForm onSaved={() => { /* no-op: history below updates when party reselected */ }} />
      </div>

      <div className="border rounded-md p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-[12rem]">
            <label className="text-sm">Category</label>
            <Select value={catId || 'none'} onValueChange={(v) => setCatId(v === 'none' ? undefined : v)}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select category</SelectItem>
                {categories.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-[14rem]">
            <label className="text-sm">Subcategory</label>
            <Select value={subId || 'none'} onValueChange={(v) => setSubId(v === 'none' ? undefined : v)}>
              <SelectTrigger className="h-9" disabled={!catId}>
                <SelectValue placeholder={catId ? 'Select subcategory' : 'Choose category first'} />
              </SelectTrigger>
              <SelectContent>
                {catId ? <SelectItem value="none">All in category</SelectItem> : null}
                {(subs as any[]).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grow min-w-[16rem]">
            <label className="text-sm">Search (party / items)</label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Type party name or item" />
          </div>
          <div className="w-full sm:w-[16rem]">
            <label className="text-sm">Select Item</label>
            <Select value={itemId || 'none'} onValueChange={(v) => setItemId(v === 'none' ? '' : v)}>
              <SelectTrigger className="h-9" disabled={!catId && !subId}>
                <SelectValue placeholder={itemsLoading ? 'Loading items…' : (subId ? 'Select item' : catId ? 'Select item (all subs)' : 'Choose category first')} />
              </SelectTrigger>
              <SelectContent>
                {(items as any[])
                  .filter((it) => !search.trim() || (it.name?.toLowerCase().includes(search.toLowerCase()) || (it.sku || '').toLowerCase().includes(search.toLowerCase())))
                  .map((it: any) => (
                    <SelectItem key={it.id} value={it.id}>{it.name}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto flex items-end gap-2">
            <Button variant="outline" size="sm" onClick={async () => {
              if (!itemId) { toast.error('Select an item first'); return }
              try {
                setOpenItemHistory(true)
                setHistoryLines(await getPurchaseHistory({ itemId }))
              } catch (e: any) { toast.error(e.message || 'Failed to load item history') }
            }}>Item History</Button>
            <Button variant="outline" size="sm" onClick={async () => {
              if (!partyId) { toast.error('Select a party first'); return }
              try {
                setOpenPartyHistory(true)
                setHistoryLines(await getPartyPurchaseHistory(partyId))
              } catch (e: any) { toast.error(e.message || 'Failed to load party history') }
            }}>Party History</Button>
          </div>
        </div>
      </div>

      <div className="border rounded-md p-3">
        <h3 className="font-medium mb-2">Record Purchase</h3>
        <PurchaseForm subcategoryId={subId} partySearch={search} itemSearch={search} />
      </div>

      <div className="border rounded-md p-3">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="w-full sm:w-[16rem]">
            <label className="text-sm">Select Party</label>
            <Select value={partyId || 'none'} onValueChange={(v) => setPartyId(v === 'none' ? '' : v)}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Select party" />
              </SelectTrigger>
              <SelectContent>
                {parties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-2 text-left">Date</th>
                <th className="p-2 text-left">Invoice</th>
                <th className="p-2 text-left">Party</th>
                <th className="p-2 text-right">Items</th>
                <th className="p-2 text-right">Total</th>
                <th className="p-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-t hover:bg-muted/30">
                  <td className="p-2">{h.purchase_date}</td>
                  <td className="p-2">{h.invoice_no || '-'}</td>
                  <td className="p-2">{h.party?.name}</td>
                  <td className="p-2 text-right">{h.itemsCount}</td>
                  <td className="p-2 text-right">{formatCurrency(h.total_amount || 0)}</td>
                  <td className="p-2 text-right">
                    <Button size="sm" variant="outline" onClick={async () => {
                      try {
                        setOpenDetails(h.id)
                        setLines(await getPurchaseDetails(h.id))
                      } catch (e: any) { toast.error(e.message || 'Failed to load details') }
                    }}>Details</Button>
                  </td>
                </tr>
              ))}
              {!loading && history.length === 0 && (
                <tr><td className="p-2 text-muted-foreground" colSpan={6}>Select a party to view purchases</td></tr>
              )}
              {loading && (
                <tr><td className="p-2" colSpan={6}>Loading…</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!openDetails} onOpenChange={() => { setOpenDetails(null); setLines([]) }}>
        <DialogContent className="bg-white border rounded-md p-4 shadow-xl max-w-2xl w-[95vw]">
          <DialogTitle>Purchase Details</DialogTitle>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50"><tr><th className="p-2 text-left">Item</th><th className="p-2 text-left">SKU</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Rate</th><th className="p-2 text-right">Amount</th></tr></thead>
              <tbody>
                {lines.map((l: any) => (
                  <tr key={l.id} className="border-t"><td className="p-2">{l.item?.name}</td><td className="p-2">{l.item?.sku || '-'}</td><td className="p-2 text-right">{Number(l.qty).toFixed(2)}</td><td className="p-2 text-right">{formatCurrency(l.rate)}</td><td className="p-2 text-right">{formatCurrency(l.amount)}</td></tr>
                ))}
                {lines.length === 0 && <tr><td className="p-2 text-muted-foreground" colSpan={5}>No lines</td></tr>}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openItemHistory} onOpenChange={(v) => { setOpenItemHistory(v); if (!v) setHistoryLines([]) }}>
        <DialogContent className="bg-white border rounded-md p-4 shadow-xl max-w-3xl w-[95vw]">
          <DialogTitle>Item Purchase History</DialogTitle>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50"><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Party</th><th className="p-2 text-left">Item</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Rate</th><th className="p-2 text-right">Amount</th></tr></thead>
              <tbody>
                {historyLines.map((r: any, i: number) => (
                  <tr key={i} className="border-t"><td className="p-2">{r.purchase?.purchase_date}</td><td className="p-2">{r.purchase?.party?.name}</td><td className="p-2">{r.item?.name}</td><td className="p-2 text-right">{Number(r.qty).toFixed(2)}</td><td className="p-2 text-right">{formatCurrency(r.rate)}</td><td className="p-2 text-right">{formatCurrency(r.amount)}</td></tr>
                ))}
                {historyLines.length === 0 && <tr><td className="p-2 text-muted-foreground" colSpan={6}>No records</td></tr>}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openPartyHistory} onOpenChange={(v) => { setOpenPartyHistory(v); if (!v) setHistoryLines([]) }}>
        <DialogContent className="bg-white border rounded-md p-4 shadow-xl max-w-3xl w-[95vw]">
          <DialogTitle>Party Purchase History</DialogTitle>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50"><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Invoice</th><th className="p-2 text-left">Item</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Rate</th><th className="p-2 text-right">Amount</th></tr></thead>
              <tbody>
                {historyLines.map((r: any, i: number) => (
                  <tr key={i} className="border-t"><td className="p-2">{r.purchase?.purchase_date}</td><td className="p-2">{r.purchase?.invoice_no || '-'}</td><td className="p-2">{r.item?.name}</td><td className="p-2 text-right">{Number(r.qty).toFixed(2)}</td><td className="p-2 text-right">{formatCurrency(r.rate)}</td><td className="p-2 text-right">{formatCurrency(r.amount)}</td></tr>
                ))}
                {historyLines.length === 0 && <tr><td className="p-2 text-muted-foreground" colSpan={6}>No records</td></tr>}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
