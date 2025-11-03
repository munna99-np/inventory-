/**
 * Sync Service
 * 
 * Handles synchronization between local offline storage and Supabase.
 * Automatically syncs when online.
 */

import { supabase, isSupabaseConfigured } from './supabaseClient'
import { offlineStorage } from './offlineStorage'

type OnlineStatus = 'online' | 'offline' | 'unknown'

class SyncService {
  private isOnline: OnlineStatus = 'unknown'
  private syncInProgress = false
  private listeners: Set<(online: boolean) => void> = new Set()

  constructor() {
    if (typeof window !== 'undefined') {
      this.isOnline = navigator.onLine ? 'online' : 'offline'
      window.addEventListener('online', () => this.handleOnline())
      window.addEventListener('offline', () => this.handleOffline())
      // Check online status periodically
      setInterval(() => this.checkOnlineStatus(), 5000)
    }
  }

  private handleOnline() {
    this.isOnline = 'online'
    this.notifyListeners(true)
    // Trigger sync when coming online
    this.sync().catch((err) => {
      console.error('Auto-sync failed:', err)
    })
  }

  private handleOffline() {
    this.isOnline = 'offline'
    this.notifyListeners(false)
  }

  private async checkOnlineStatus() {
    if (!isSupabaseConfigured) return

    try {
      // Use navigator.onLine for quick check first
      if (!navigator.onLine) {
        if (this.isOnline !== 'offline') {
          this.handleOffline()
        }
        return
      }

      // Try a lightweight request to Supabase to verify connectivity
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      
      try {
        const promise = supabase.from('accounts').select('id').limit(1)
        const { error } = await Promise.race([
          promise,
          new Promise<{ error: any }>((_, reject) => {
            controller.signal.addEventListener('abort', () => {
              reject(new Error('Request timeout'))
            })
          }),
        ]) as { error: any }
        
        clearTimeout(timeoutId)
        const wasOnline = this.isOnline === 'online'
        this.isOnline = error && (error.message?.includes('fetch') || error.message?.includes('Network')) ? 'offline' : 'online'
        
        if (!wasOnline && this.isOnline === 'online') {
          this.handleOnline()
        } else if (wasOnline && this.isOnline === 'offline') {
          this.handleOffline()
        }
      } catch (err: any) {
        clearTimeout(timeoutId)
        if (err.name === 'AbortError' || err.message?.includes('timeout') || err.message?.includes('Network')) {
          const wasOnline = this.isOnline === 'online'
          this.isOnline = 'offline'
          if (wasOnline) {
            this.handleOffline()
          }
        }
      }
    } catch {
      this.isOnline = 'offline'
      if (this.isOnline !== 'offline') {
        this.handleOffline()
      }
    }
  }

  private notifyListeners(online: boolean) {
    this.listeners.forEach((listener) => listener(online))
  }

  onStatusChange(listener: (online: boolean) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getStatus(): OnlineStatus {
    return this.isOnline
  }

  isConnected(): boolean {
    return this.isOnline === 'online' && isSupabaseConfigured
  }

  async sync(): Promise<void> {
    if (!isSupabaseConfigured || this.syncInProgress) return
    if (this.isOnline !== 'online') return

    this.syncInProgress = true

    try {
      // Get all items in sync queue
      const queue = await offlineStorage.getSyncQueue()

      if (queue.length === 0) {
        // No pending syncs, but refresh local data from server
        await this.syncFromServer()
        return
      }

      // Process sync queue
      const syncedItems: typeof queue = []

      for (const item of queue) {
        try {
          switch (item.operation) {
            case 'INSERT':
              await this.syncInsert(item.table, item.data)
              break
            case 'UPDATE':
              await this.syncUpdate(item.table, item.data)
              break
            case 'DELETE':
              await this.syncDelete(item.table, item.data.id)
              break
          }
          syncedItems.push(item)
        } catch (err) {
          console.error(`Failed to sync ${item.operation} on ${item.table}:`, err)
          // Continue with other items
        }
      }

      // Clear successfully synced items
      if (syncedItems.length > 0) {
        await offlineStorage.clearSyncQueueByItems(syncedItems)
      }

      // After syncing queue, refresh from server
      await this.syncFromServer()
    } catch (err) {
      console.error('Sync failed:', err)
    } finally {
      this.syncInProgress = false
    }
  }

  private async syncInsert(table: string, data: any) {
    const { error } = await supabase.from(table).insert(data)
    if (error) throw error
    // Update local storage with server response (includes generated IDs, timestamps, etc.)
    await offlineStorage.save(table as any, data)
  }

  private async syncUpdate(table: string, data: any) {
    const { error } = await supabase.from(table).update(data).eq('id', data.id)
    if (error) throw error
    // Update local storage
    await offlineStorage.save(table as any, data)
  }

  private async syncDelete(table: string, id: string) {
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) throw error
    // Remove from local storage
    await offlineStorage.delete(table as any, id)
  }

  private async syncFromServer() {
    if (!isSupabaseConfigured) return

    const tables: Array<{ name: string; key: string }> = [
      { name: 'accounts', key: 'id' },
      { name: 'transactions', key: 'id' },
      { name: 'transfers', key: 'id' },
      { name: 'categories', key: 'id' },
      { name: 'parties', key: 'id' },
    ]

    for (const { name } of tables) {
      try {
        const { data, error } = await supabase.from(name).select('*')
        if (error) {
          console.error(`Failed to sync ${name} from server:`, error)
          continue
        }
        if (data) {
          await offlineStorage.save(name as any, data)
        }
      } catch (err) {
        console.error(`Error syncing ${name}:`, err)
      }
    }
  }

  async syncTable(table: string): Promise<void> {
    if (!isSupabaseConfigured || this.isOnline !== 'online') return

    try {
      const { data, error } = await supabase.from(table).select('*')
      if (error) throw error
      if (data) {
        await offlineStorage.save(table as any, data)
      }
    } catch (err) {
      console.error(`Failed to sync table ${table}:`, err)
      throw err
    }
  }
}

export const syncService = new SyncService()

// Auto-sync when coming online
if (typeof window !== 'undefined') {
  syncService.onStatusChange((online) => {
    if (online) {
      syncService.sync().catch((err) => {
        console.error('Auto-sync on online status change failed:', err)
      })
    }
  })
}

