import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { transactionSchema } from '../../types/transactions'
import { Input } from '../../components/ui/input'
import { Button } from '../../components/ui/button'
import { FormField } from '../../components/ui/form-field'
import MoneyInput from '../../components/fields/MoneyInput'
import ScopeSelect from '../../components/fields/ScopeSelect'
import { useAccounts } from '../../hooks/useAccounts'
import { useCategories } from '../../hooks/useCategories'
import { useParties } from '../../hooks/useParties'
import { supabase } from '../../lib/supabaseClient'
import { INFLOW_SOURCE_GROUPS } from '../../lib/inflowSources'
import type { InflowSource } from '../../types/projects'
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
      form.setValue('inflowSource', null)
    }
    if (direction === 'in') {
      form.setValue('category_id', null)
      form.setValue('sub_category_id', null)
      form.setValue('party_id', null)
    }
    if (direction === 'out') {
      form.setValue('inflowSource', null)
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
      let finalCategoryId: string | null = null
      if (direction === 'in') {
        // For inflow, require inflowSource instead of category
        if (!values.inflowSource) {
          toast.error('Please select an inflow source')
          return
        }
      } else {
        // For outflow, require category
        finalCategoryId = (values.sub_category_id || values.category_id) || null
        if (!finalCategoryId) {
          toast.error('Please choose a category before saving')
          return
        }
        const needsParty = categories.find((c) => c.id === finalCategoryId)?.name
        if (needsParty && PARTY_REQUIRED_FOR.has(needsParty.toLowerCase()) && !values.party_id) {
          toast.error('Party required for selected category')
          return
        }
      }
      const absolute = Math.abs(values.amount)
      const signedAmount = values.direction === 'out' ? -absolute : absolute
      const { sub_category_id: _ignoredSubCategory, inflowSource, ...rest } = values
      const payload = {
        ...rest,
        category_id: finalCategoryId ?? null,
        inflow_source: inflowSource ?? null,
        amount: signedAmount,
        qty: rest.qty ?? null,
        date: rest.date.toISOString().slice(0, 10),
      }
      setSubmitting(true)
      const { error } = await supabase.from('transactions').insert(payload as any)
      setSubmitting(false)
      if (error) return toast.error(error.message)
      toast.success('Transaction added')
      form.reset({ direction: 'out', scope: values.scope, date: new Date(), category_id: null, sub_category_id: null, party_id: null, inflowSource: null } as any)
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
    <form className="w-full max-w-4xl mx-auto space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
        <FormField label="Date" htmlFor="date">
          <Input 
            id="date" 
            type="date" 
            className="w-full" 
            {...form.register('date')} 
          />
        </FormField>

        <FormField label="Account" htmlFor="account_id" required>
          <select 
            id="account_id"
            className="h-10 w-full rounded-md border border-input bg-background px-4 py-2 text-base shadow-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:h-11" 
            {...form.register('account_id')}
          >
            <option value="">Select account</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </FormField>

        <FormField label="Direction" htmlFor="direction">
          <select 
            id="direction"
            className="h-10 w-full rounded-md border border-input bg-background px-4 py-2 text-base shadow-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:h-11" 
            {...form.register('direction')}
          >
            <option value="in">Inflow</option>
            <option value="out">Outflow</option>
            <option value="transfer">Transfer</option>
          </select>
        </FormField>

        <FormField label="Scope" htmlFor="scope">
          <ScopeSelect
            value={form.watch('scope') as any}
            onValueChange={(v) => form.setValue('scope', v)}
            className="w-full"
            placeholder="Choose scope"
          />
        </FormField>

        {direction === 'in' && (
          <FormField 
            label="Inflow Source" 
            htmlFor="inflowSource" 
            required
            description="Select where this inflow is coming from"
            className="sm:col-span-2"
          >
            <select
              id="inflowSource"
              className="h-10 w-full rounded-md border border-input bg-background px-4 py-2 text-base shadow-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:h-11"
              value={form.watch('inflowSource') || ''}
              onChange={(event) => form.setValue('inflowSource', (event.target.value as InflowSource) || null)}
            >
              <option value="">Select inflow source</option>
              {Object.entries(INFLOW_SOURCE_GROUPS).map(([category, sources]) => (
                <optgroup key={category} label={category}>
                  {sources.map((source) => (
                    <option key={source.value} value={source.value}>
                      {source.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </FormField>
        )}

        {direction === 'out' && (
          <FormField 
            label="Category" 
            htmlFor="category_id" 
            required
            description={!categoryId ? "Please choose a category to classify this transaction." : undefined}
            className="sm:col-span-2"
          >
            <select
              id="category_id"
              className="h-10 w-full rounded-md border border-input bg-background px-4 py-2 text-base shadow-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:h-11"
              value={categoryId ?? ''}
              onChange={(event) => form.setValue('category_id', event.target.value || null)}
            >
              <option value="">Select category</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </FormField>
        )}

        {direction === 'out' && categoryId && (
          <FormField 
            label="Sub-category" 
            htmlFor="sub_category_id"
            description={childCategories.length === 0 ? "No sub-categories yet. Use the button to create one instantly." : undefined}
            className="sm:col-span-2"
          >
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <select
                id="sub_category_id"
                className="h-10 flex-1 rounded-md border border-input bg-background px-4 py-2 text-base shadow-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:h-11"
                value={subCategoryId ?? ''}
                onChange={(event) => form.setValue('sub_category_id', event.target.value || null)}
              >
                <option value="">No sub-category</option>
                {childCategories.map((child) => (
                  <option key={child.id} value={child.id}>{child.name}</option>
                ))}
              </select>
              <Button 
                type="button" 
                variant="outline" 
                size="default"
                className="w-full sm:w-auto"
                onClick={handleCreateSubCategory}
              >
                Add sub-category
              </Button>
            </div>
          </FormField>
        )}

        {showParty && direction === 'out' && (
          <FormField label="Party" htmlFor="party_id" required>
            <select 
              id="party_id"
              className="h-10 w-full rounded-md border border-input bg-background px-4 py-2 text-base shadow-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:h-11" 
              {...form.register('party_id')}
            >
              <option value="">Select party</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </FormField>
        )}

        <FormField label="Mode" htmlFor="mode">
          <Input 
            id="mode"
            placeholder="cash, bank_transfer, etc" 
            className="w-full"
            {...form.register('mode')} 
          />
        </FormField>

        <FormField label="Amount" htmlFor="amount" required>
          <MoneyInput 
            value={form.watch('amount') as any} 
            onChange={(v) => form.setValue('amount', v as any)} 
          />
        </FormField>

        <FormField label="Quantity (optional)" htmlFor="qty">
          <MoneyInput 
            value={form.watch('qty') as any} 
            onChange={(v) => form.setValue('qty', v as any)} 
          />
        </FormField>

        <FormField label="Notes" htmlFor="notes" className="sm:col-span-2">
          <Input 
            id="notes"
            placeholder="Optional" 
            className="w-full"
            {...form.register('notes')} 
          />
        </FormField>
      </div>

      <div className="flex flex-col sm:flex-row justify-end gap-3 pt-2">
        <Button 
          type="submit" 
          size="lg"
          className="w-full sm:w-auto sm:min-w-[140px]"
          disabled={submitting}
        >
          {submitting ? 'Saving...' : 'Add Transaction'}
        </Button>
      </div>
    </form>
  )
}

