import { useMemo, useState } from 'react'
import { useParties } from '../hooks/useParties'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { SearchBar } from '../components/ui/search-bar'
import { supabase } from '../lib/supabaseClient'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog'
import { Plus } from 'lucide-react'

type PartyType = 'company' | 'personal'
type Party = {
  id?: string
  name: string
  phone?: string | null
  email?: string | null
  address?: string | null
  type: PartyType
}
type EditState = Party | null

export default function PartiesPage() {
  const { data, error, refetch } = useParties()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<EditState>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return data
    return data.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.phone ?? '').toLowerCase().includes(q) ||
        (p.email ?? '').toLowerCase().includes(q) ||
        (p.address ?? '').toLowerCase().includes(q)
    )
  }, [data, search])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Parties</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your contacts and business parties</p>
        </div>
        <Button
          size="lg"
          className="gap-2"
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus size={18} /> Add Party
        </Button>
      </div>
      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search parties by name, phone, email, address…"
        actions={[]}
      />
      {error && <div className="text-sm text-red-600 mb-2">{error}</div>}

      <div className="border rounded-lg overflow-x-auto shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-semibold">Name</th>
              <th className="text-left p-3 font-semibold">Phone</th>
              <th className="text-left p-3 font-semibold">Email</th>
              <th className="text-left p-3 font-semibold">Address</th>
              <th className="text-left p-3 font-semibold">Type</th>
              <th className="text-right p-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-t hover:bg-muted/20 transition">
                <td className="p-3 font-medium">{p.name}</td>
                <td className="p-3">{p.phone ?? '-'}</td>
                <td className="p-3">{p.email ?? '-'}</td>
                <td className="p-3">{p.address ?? '-'}</td>
                <td className="p-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                      p.type === 'company'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {p.type === 'company' ? 'Company' : 'Personal'}
                  </span>
                </td>
                <td className="p-3 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    className="mr-2"
                    onClick={() => {
                      setEditing(p)
                      setDialogOpen(true)
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={async () => {
                      const { error } = await supabase.from('parties').delete().eq('id', p.id)
                      if (error) {
                        if (/foreign key|violates/.test(error.message)) {
                          toast.error('Cannot delete: party is used by transactions')
                        } else {
                          toast.error(error.message)
                        }
                        return
                      }
                      toast.success('Party deleted')
                      await refetch()
                    }}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={6}>
                  No parties found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md w-full">
          <DialogTitle>{editing ? 'Edit Party' : 'Add Party'}</DialogTitle>
          <PartyDialogForm
            initial={editing}
            onClose={() => setDialogOpen(false)}
            onSaved={async () => {
              setDialogOpen(false)
              await refetch()
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PartyDialogForm({
  initial,
  onClose,
  onSaved,
}: {
  initial?: Party | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [type, setType] = useState<PartyType>(initial?.type ?? 'company')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!name.trim()) return toast.error('Name is required')
    setSaving(true)
    const payload: any = {
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      type,
    }
    let error
    if (initial?.id) {
      ;({ error } = await supabase.from('parties').update(payload).eq('id', initial.id))
    } else {
      ;({ error } = await supabase.from('parties').insert(payload))
    }
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success(initial?.id ? 'Party updated' : 'Party added')
    onSaved()
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        handleSave()
      }}
    >
      <div className="space-y-2">
        <label className="block text-sm font-medium">
          Name <span className="text-red-500">*</span>
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Sita Traders"
          required
          autoFocus
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="block text-sm font-medium">Phone</label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9800…" />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium">Email</label>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="example@email.com"
            type="email"
          />
        </div>
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium">Address</label>
        <Input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="e.g. Kathmandu, Nepal"
        />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium">Type</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              className="accent-blue-600"
              checked={type === 'company'}
              onChange={() => setType('company')}
            />
            <span className="text-sm">Company</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              className="accent-green-600"
              checked={type === 'personal'}
              onChange={() => setType('personal')}
            />
            <span className="text-sm">Personal</span>
          </label>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {initial?.id ? 'Save Changes' : 'Add Party'}
        </Button>
      </div>
    </form>
  )
}
