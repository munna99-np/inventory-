import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { transactionSchema } from '../../types/transactions'
import { Input } from '../../components/ui/input'
import { Button } from '../../components/ui/button'
import MoneyInput from '../../components/fields/MoneyInput'
import ScopeSelect from '../../components/fields/ScopeSelect'
import { useAccounts } from '../../hooks/useAccounts'
import { useCategories } from '../../hooks/useCategories'
import { useParties } from '../../hooks/useParties'
import { supabase } from '../../lib/supabaseClient'
import { toast } from 'sonner'

const formSchema = transactionSchema.extend({
  date: z.coerce.date(),
  sub_category_id: z.string().uuid().optional().nullable(),
})

type FormValues = z.infer<typeof formSchema>

const PARTY_REQUIRED_FOR = new Set(['loan', 'sapati', 'bills', 'salary'])

export default function TransactionForm({ onCreated, initialScope }: { onCreated?: () => void; initialScope?: 'personal' | 'work' }) {
  const navigate = useNavigate()
  const { data: accounts } = useAccounts()
  const [submitting, setSubmitting] = useState(false)
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { direction: 'out', scope: initialScope ?? 'personal', date: new Date() } as any,
  })

  useEffect(() => {
    if (!initialScope) return
    form.setValue('scope', initialScope)
  }, [initialScope, form])

  const scope = form.watch('scope') as 'personal' | 'work' | undefined
  const { data: categories, refetch: refetchCategories } = useCategories(scope)
  const { data: parties } = useParties()

  const direction = form.watch('direction')
  const categoryId = form.watch('category_id')
  const subCategoryId = form.watch('sub_category_id')

  const childCategories = useMemo(() => categories.filter((c) => c.parent_id === categoryId), [categories, categoryId])
  const effectiveCategoryId = subCategoryId || categoryId

  useEffect(() => {
    if (direction === 'transfer') {
      form.setValue('category_id', null)
      form.setValue('sub_category_id', null)
      form.setValue('party_id', null)
    }
  }, [direction, form])

  useEffect(() => {
    form.setValue('category_id', null)
    form.setValue('sub_category_id', null)
    form.setValue('party_id', null)
  }, [scope, form])

  useEffect(() => {
    form.setValue('sub_category_id', null)
  }, [categoryId, form])

  const filteredCategories = useMemo(() => {
    if (!scope) return []
    return categories.filter((c) => c.scope === scope && !c.parent_id)
  }, [categories, scope])

  const showParty = useMemo(() => {
    if (direction === 'transfer') return false
    const catName = categories.find((c) => c.id === effectiveCategoryId)?.name?.toLowerCase()
    return catName ? PARTY_REQUIRED_FOR.has(catName) : false
  }, [categories, direction, effectiveCategoryId])

  const handleCreateSubCategory = async () => {
    if (!categoryId) {
      toast.error('Select a category first')
      return
    }
    const label = window.prompt('New sub-category name')
    const name = label?.trim()
    if (!name) return

    try {
      const payload: Record<string, any> = {
        name,
        scope: scope ?? 'personal',
        parent_id: categoryId,
      }
      const { data: inserted, error } = await supabase.from('categories').insert(payload).select('id').single()
      if (error) throw error
      await refetchCategories()
      if (inserted?.id) {
        form.setValue('sub_category_id', inserted.id)
      }
      toast.success('Sub-category created')
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to create sub-category')
    }
  }

  const onSubmit = async (values: FormValues) => {
    if (!values.account_id) {
      toast.error('Please select an account')
      return
    }
    if (direction !== 'transfer') {
      if (values.amount == null || Number.isNaN(values.amount)) {
        toast.error('Amount is required')
        return
      }
      const finalCategoryId = values.sub_category_id || values.category_id
      if (!finalCategoryId) {
        toast.error('Please choose a category before saving')
        return
      }
      const needsParty = categories.find((c) => c.id === finalCategoryId)?.name
      if (needsParty && PARTY_REQUIRED_FOR.has(needsParty.toLowerCase()) && !values.party_id) {
        toast.error('Party required for selected category')
        return
      }
      const absolute = Math.abs(values.amount)
      const signedAmount = values.direction === 'out' ? -absolute : absolute
      const { sub_category_id: _ignoredSubCategory, ...rest } = values
      const payload = {
        ...rest,
        category_id: finalCategoryId ?? null,
        amount: signedAmount,
        qty: rest.qty ?? null,
        date: rest.date.toISOString().slice(0, 10),
      }
      setSubmitting(true)
      const { error } = await supabase.from('transactions').insert(payload as any)
      setSubmitting(false)
      if (error) return toast.error(error.message)
      toast.success('Transaction added')
      form.reset({ direction: 'out', scope: values.scope, date: new Date(), category_id: null, sub_category_id: null, party_id: null } as any)
      onCreated?.()
    } else {
      const amt = Math.abs(values.amount || 0)
      navigate('/transfers', {
        state: {
          from_account: values.account_id,
          amount: amt > 0 ? amt : undefined,
        },
      })
      toast.info('Switched to Transfers form')
    }
  }

  return (
    <form className="grid grid-cols-1 md:grid-cols-2 gap-3" onSubmit={form.handleSubmit(onSubmit)}>
      <div>
        <label className="text-sm">Date</label>
        <Input type="date" {...form.register('date')} />
      </div>
      <div>
        <label className="text-sm">Account</label>
        <select className="h-9 w-full border rounded-md px-2" {...form.register('account_id')}>
          <option value="">Select account</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-sm">Direction</label>
        <select className="h-9 w-full border rounded-md px-2" {...form.register('direction')}>
          <option value="in">Inflow</option>
          <option value="out">Outflow</option>
          <option value="transfer">Transfer</option>
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-sm">Scope</label>
        <ScopeSelect
          value={form.watch('scope') as any}
          onValueChange={(v) => form.setValue('scope', v)}
          className="w-full"
          placeholder="Choose scope"
        />
      </div>
      {direction !== 'transfer' && (
        <div className="space-y-1">
          <label className="text-sm">Category</label>
          <select
            className="h-9 w-full rounded-md border px-2 transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            value={categoryId ?? ''}
            onChange={(event) => form.setValue('category_id', event.target.value || null)}
          >
            <option value="">Select category</option>
            {filteredCategories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {!categoryId ? (
            <p className="text-xs text-amber-600">Please choose a category to classify this transaction.</p>
          ) : null}
        </div>
      )}
      {direction !== 'transfer' && categoryId && (
        <div className="md:col-span-2 space-y-1">
          <label className="text-sm">Sub-category</label>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-9 w-full border rounded-md px-2 md:w-auto"
              value={subCategoryId ?? ''}
              onChange={(event) => form.setValue('sub_category_id', event.target.value || null)}
            >
              <option value="">No sub-category</option>
              {childCategories.map((child) => (
                <option key={child.id} value={child.id}>{child.name}</option>
              ))}
            </select>
            <Button type="button" variant="outline" size="sm" onClick={handleCreateSubCategory}>
              Add sub-category
            </Button>
          </div>
          {childCategories.length === 0 ? (
            <p className="text-xs text-muted-foreground">No sub-categories yet. Use the button to create one instantly.</p>
          ) : null}
        </div>
      )}
      {showParty && (
        <div>
          <label className="text-sm">Party</label>
          <select className="h-9 w-full border rounded-md px-2" {...form.register('party_id')}>
            <option value="">Select party</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="text-sm">Mode</label>
        <Input placeholder="cash, bank_transfer, etc" {...form.register('mode')} />
      </div>
      <div>
        <label className="text-sm">Amount</label>
        <MoneyInput value={form.watch('amount') as any} onChange={(v) => form.setValue('amount', v as any)} />
      </div>
      <div>
        <label className="text-sm">Quantity (optional)</label>
        <MoneyInput value={form.watch('qty') as any} onChange={(v) => form.setValue('qty', v as any)} />
      </div>
      <div className="md:col-span-2">
        <label className="text-sm">Notes</label>
        <Input placeholder="Optional" {...form.register('notes')} />
      </div>
      <div className="md:col-span-2 flex justify-end">
        <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Add Transaction'}</Button>
      </div>
    </form>
  )
}

