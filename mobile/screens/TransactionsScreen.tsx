import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, FlatList } from 'react-native'
import { useTransactions } from '../hooks/useTransactions'
import { formatCurrency } from '../lib/format'
import { formatAppDate } from '../lib/date'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Input } from '../components/ui/Input'

export default function TransactionsScreen() {
  const [searchQuery, setSearchQuery] = useState('')
  const { data, loading, error } = useTransactions({ search: searchQuery || undefined })

  const renderTransaction = ({ item }: { item: any }) => {
    const isIncome = item.direction === 'in'
    const amountColor = isIncome ? '#22c55e' : '#ef4444'
    const amountPrefix = isIncome ? '+' : '-'

    return (
      <Card style={styles.transactionCard}>
        <CardContent>
          <View style={styles.transactionRow}>
            <View style={styles.transactionInfo}>
              <Text style={styles.transactionNotes}>{item.notes || 'No description'}</Text>
              <Text style={styles.transactionDate}>{formatAppDate(item.date)}</Text>
              {item.mode && (
                <Text style={styles.transactionMode}>{item.mode}</Text>
              )}
            </View>
            <View style={styles.transactionAmount}>
              <Text style={[styles.amountText, { color: amountColor }]}>
                {amountPrefix}{formatCurrency(Math.abs(item.amount))}
              </Text>
              {item.scope && (
                <Text style={styles.scopeText}>{item.scope}</Text>
              )}
            </View>
          </View>
        </CardContent>
      </Card>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Transactions</Text>
      </View>

      <View style={styles.searchContainer}>
        <Input
          placeholder="Search transactions..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          containerStyle={styles.searchInput}
        />
      </View>

      {loading && !data?.length && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading transactions...</Text>
        </View>
      )}

      {error && (
        <Card style={styles.errorCard}>
          <CardContent>
            <Text style={styles.errorText}>{error}</Text>
          </CardContent>
        </Card>
      )}

      {data && data.length === 0 && !loading && (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No transactions found</Text>
        </View>
      )}

      {data && data.length > 0 && (
        <FlatList
          data={data}
          renderItem={renderTransaction}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  searchContainer: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  searchInput: {
    marginBottom: 0,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
  },
  errorCard: {
    margin: 16,
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
  },
  errorText: {
    color: '#dc2626',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  transactionCard: {
    marginBottom: 8,
  },
  transactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  transactionInfo: {
    flex: 1,
    marginRight: 12,
  },
  transactionNotes: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  transactionMode: {
    fontSize: 12,
    color: '#9ca3af',
  },
  transactionAmount: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  scopeText: {
    fontSize: 10,
    color: '#9ca3af',
    textTransform: 'uppercase',
  },
})
