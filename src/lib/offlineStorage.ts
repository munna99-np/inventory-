/**
 * Offline Storage Service
 * 
 * Provides local storage using IndexedDB for offline functionality.
 * Automatically syncs data when online.
 */

const DB_NAME = 'finance_tracker_db'
const DB_VERSION = 1

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
  | 'sync_queue'

interface SyncItem {
  id: string
  table: string
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  data: any
  timestamp: number
}

class OfflineStorage {
  private db: IDBDatabase | null = null
  private initPromise: Promise<void> | null = null

  async init(): Promise<void> {
    if (this.db) return
    if (this.initPromise) return this.initPromise

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Create object stores for each table
        const tables: TableName[] = [
          'accounts',
          'transactions',
          'transfers',
          'categories',
          'parties',
          'staff',
          'inventory_items',
          'inventory_categories',
          'projects',
          'sync_queue',
        ]

        for (const table of tables) {
          if (!db.objectStoreNames.contains(table)) {
            const store = db.createObjectStore(table, { keyPath: 'id' })
            if (table === 'transactions' || table === 'transfers') {
              store.createIndex('date', 'date', { unique: false })
            }
            if (table === 'sync_queue') {
              store.createIndex('timestamp', 'timestamp', { unique: false })
            }
          }
        }
      }
    })

    return this.initPromise
  }

  private async ensureInit(): Promise<IDBDatabase> {
    await this.init()
    if (!this.db) throw new Error('Failed to initialize IndexedDB')
    return this.db
  }

  async save<T extends { id: string }>(table: TableName, items: T | T[]): Promise<void> {
    const db = await this.ensureInit()
    const transaction = db.transaction([table], 'readwrite')
    const store = transaction.objectStore(table)
    const itemsArray = Array.isArray(items) ? items : [items]

    await Promise.all(
      itemsArray.map(
        (item) =>
          new Promise<void>((resolve, reject) => {
            const request = store.put(item)
            request.onsuccess = () => resolve()
            request.onerror = () => reject(request.error)
          })
      )
    )
  }

  async get<T>(table: TableName, id?: string): Promise<T | T[] | null> {
    const db = await this.ensureInit()
    const transaction = db.transaction([table], 'readonly')
    const store = transaction.objectStore(table)

    if (id) {
      return new Promise<T | null>((resolve, reject) => {
        const request = store.get(id)
        request.onsuccess = () => resolve(request.result || null)
        request.onerror = () => reject(request.error)
      })
    }

    return new Promise<T[]>((resolve, reject) => {
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })
  }

  async delete(table: TableName, id: string): Promise<void> {
    const db = await this.ensureInit()
    const transaction = db.transaction([table], 'readwrite')
    const store = transaction.objectStore(table)

    return new Promise<void>((resolve, reject) => {
      const request = store.delete(id)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async clear(table: TableName): Promise<void> {
    const db = await this.ensureInit()
    const transaction = db.transaction([table], 'readwrite')
    const store = transaction.objectStore(table)

    return new Promise<void>((resolve, reject) => {
      const request = store.clear()
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async query<T>(table: TableName, filter?: (item: T) => boolean): Promise<T[]> {
    const all = await this.get<T>(table)
    if (!Array.isArray(all)) return []
    return filter ? all.filter(filter) : all
  }

  async addToSyncQueue(table: string, operation: 'INSERT' | 'UPDATE' | 'DELETE', data: any): Promise<void> {
    const syncItem: SyncItem = {
      id: `${table}_${data.id}_${Date.now()}`,
      table,
      operation,
      data,
      timestamp: Date.now(),
    }
    await this.save('sync_queue', syncItem)
  }

  async getSyncQueue(): Promise<SyncItem[]> {
    const queue = await this.get<SyncItem>('sync_queue')
    return Array.isArray(queue) ? queue.sort((a, b) => a.timestamp - b.timestamp) : []
  }

  async clearSyncQueue(ids: string[]): Promise<void> {
    const db = await this.ensureInit()
    const transaction = db.transaction(['sync_queue'], 'readwrite')
    const store = transaction.objectStore('sync_queue')

    await Promise.all(
      ids.map(
        (id) =>
          new Promise<void>((resolve, reject) => {
            const request = store.delete(id)
            request.onsuccess = () => resolve()
            request.onerror = () => reject(request.error)
          })
      )
    )
  }

  async clearSyncQueueByItems(items: SyncItem[]): Promise<void> {
    const ids = items.map((item) => item.id)
    await this.clearSyncQueue(ids)
  }
}

export const offlineStorage = new OfflineStorage()

// Initialize on module load
if (typeof window !== 'undefined') {
  offlineStorage.init().catch((err) => {
    console.error('Failed to initialize offline storage:', err)
  })
}

