/**
 * Offline Database Helper
 * 
 * Provides wrapper functions for Supabase operations that handle offline storage
 * and sync queue automatically.
 */

import { supabase, isSupabaseConfigured } from './supabaseClient'
import { offlineStorage } from './offlineStorage'
import { syncService } from './syncService'

type TableName = 
  | 'accounts'
  | 'transactions'
  | 'transfers'
  | 'categories'
  | 'parties'
  | 'staff'
  | 'inventory_items'
  | 'inventory_categories'
  | 'projects'

/**
 * Insert data into a table, handling offline storage
 */
export async function insertWithOffline<T extends { id?: string }>(
  table: TableName,
  data: T | T[]
): Promise<{ data: T[] | null; error: Error | null }> {
  const dataArray = Array.isArray(data) ? data : [data]
  
  // Generate IDs for offline storage if not present
  const dataWithIds = dataArray.map((item) => ({
    ...item,
    id: item.id || `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  }))

  // Save to offline storage immediately
  try {
    await offlineStorage.save(table, dataWithIds)
  } catch (err) {
    console.error('Failed to save to offline storage:', err)
  }

  // If online, try to insert to Supabase
  if (syncService.isConnected() && isSupabaseConfigured) {
    try {
      const { data: result, error } = await supabase.from(table).insert(data).select()
      
      if (error) {
        // If insert fails, add to sync queue
        for (const item of dataWithIds) {
          await offlineStorage.addToSyncQueue(table, 'INSERT', item)
        }
        return { data: null, error: new Error(error.message) }
      }

      // Update offline storage with server response (includes real IDs, timestamps, etc.)
      if (result && result.length > 0) {
        await offlineStorage.save(table, result)
      }

      return { data: result as T[], error: null }
    } catch (err) {
      // Network error - add to sync queue
      for (const item of dataWithIds) {
        await offlineStorage.addToSyncQueue(table, 'INSERT', item)
      }
      // Return local data
      return { data: dataWithIds as T[], error: null }
    }
  } else {
    // Offline - add to sync queue
    for (const item of dataWithIds) {
      await offlineStorage.addToSyncQueue(table, 'INSERT', item)
    }
    // Return local data
    return { data: dataWithIds as T[], error: null }
  }
}

/**
 * Update data in a table, handling offline storage
 */
export async function updateWithOffline<T extends { id: string }>(
  table: TableName,
  data: T | T[],
  id?: string
): Promise<{ data: T[] | null; error: Error | null }> {
  const dataArray = Array.isArray(data) ? data : [data]

  // Update offline storage immediately
  try {
    await offlineStorage.save(table, dataArray)
  } catch (err) {
    console.error('Failed to update offline storage:', err)
  }

  // If online, try to update in Supabase
  if (syncService.isConnected() && isSupabaseConfigured) {
    try {
      const updatePromises = dataArray.map((item) => {
        const itemId = id || item.id
        return supabase.from(table).update(item).eq('id', itemId).select().single()
      })

      const results = await Promise.all(updatePromises)
      const errors = results.filter((r) => r.error)

      if (errors.length > 0) {
        // Add failed updates to sync queue
        for (const item of dataArray) {
          await offlineStorage.addToSyncQueue(table, 'UPDATE', item)
        }
        const firstErr = errors[0]?.error
        return { data: null, error: new Error(firstErr?.message ?? 'Update failed') }
      }

      const updatedData = results.map((r) => r.data as T)
      
      // Update offline storage with server response
      if (updatedData.length > 0) {
        await offlineStorage.save(table, updatedData)
      }

      return { data: updatedData, error: null }
    } catch (err) {
      // Network error - add to sync queue
      for (const item of dataArray) {
        await offlineStorage.addToSyncQueue(table, 'UPDATE', item)
      }
      return { data: dataArray, error: null }
    }
  } else {
    // Offline - add to sync queue
    for (const item of dataArray) {
      await offlineStorage.addToSyncQueue(table, 'UPDATE', item)
    }
    return { data: dataArray, error: null }
  }
}

/**
 * Delete data from a table, handling offline storage
 */
export async function deleteWithOffline(
  table: TableName,
  id: string | string[]
): Promise<{ error: Error | null }> {
  const ids = Array.isArray(id) ? id : [id]

  // Remove from offline storage immediately
  try {
    await Promise.all(ids.map((itemId) => offlineStorage.delete(table, itemId)))
  } catch (err) {
    console.error('Failed to delete from offline storage:', err)
  }

  // If online, try to delete from Supabase
  if (syncService.isConnected() && isSupabaseConfigured) {
    try {
      const { error } = await supabase.from(table).delete().in('id', ids)
      
      if (error) {
        // If delete fails, add to sync queue
        for (const itemId of ids) {
          await offlineStorage.addToSyncQueue(table, 'DELETE', { id: itemId })
        }
        return { error: new Error(error.message) }
      }

      return { error: null }
    } catch (err) {
      // Network error - add to sync queue
      for (const itemId of ids) {
        await offlineStorage.addToSyncQueue(table, 'DELETE', { id: itemId })
      }
      return { error: null }
    }
  } else {
    // Offline - add to sync queue
    for (const itemId of ids) {
      await offlineStorage.addToSyncQueue(table, 'DELETE', { id: itemId })
    }
    return { error: null }
  }
}

