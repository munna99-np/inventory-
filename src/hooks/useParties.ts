import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Party } from '../types/parties'

export function useParties() {
  const [data, setData] = useState<Party[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function refetch() {
    setLoading(true)
    // Fetch all fields needed for the new UI
    const { data, error } = await supabase.from('parties').select('id,name,phone,email,address,type').order('name')
    if (error) setError(error.message)
    setData((data as any) || [])
    setLoading(false)
  }

  useEffect(() => {
    ;(async () => {
      await refetch()
    })()
  }, [])

  return { data, loading, error, refetch }
}
