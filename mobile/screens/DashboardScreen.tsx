import React from 'react'
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native'
import { useAuth } from '../lib/auth'
import { useDashboard } from '../hooks/useDashboard'
import { formatCurrency } from '../lib/format'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card'
import { Button } from '../components/ui/Button'

export default function DashboardScreen({ navigation }: any) {
  const { user, signOut } = useAuth()
  const { data, loading, error } = useDashboard()

  const handleSignOut = async () => {
    await signOut()
  }

  const onRefresh = React.useCallback(() => {
    // Dashboard will auto-refresh via useEffect
  }, [])

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Dashboard</Text>
          <Text style={styles.subtitle}>{user?.email}</Text>
        </View>
        <Button title="Sign Out" onPress={handleSignOut} variant="outline" size="sm" />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} />}
      >
        {loading && !data && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Loading dashboard...</Text>
          </View>
        )}

        {error && (
          <Card style={styles.errorCard}>
            <CardContent>
              <Text style={styles.errorText}>{error}</Text>
            </CardContent>
          </Card>
        )}

        {data && (
          <>
            {/* Stats Cards */}
            <View style={styles.statsRow}>
              <Card style={styles.statCard}>
                <CardHeader>
                  <CardTitle style={styles.statTitle}>Total Income</CardTitle>
                </CardHeader>
                <CardContent>
                  <Text style={styles.statValue}>
                    {formatCurrency(data.totalIncome)}
                  </Text>
                </CardContent>
              </Card>

              <Card style={styles.statCard}>
                <CardHeader>
                  <CardTitle style={styles.statTitle}>Total Expense</CardTitle>
                </CardHeader>
                <CardContent>
                  <Text style={styles.statValue}>
                    {formatCurrency(data.totalExpense)}
                  </Text>
                </CardContent>
              </Card>
            </View>

            <View style={styles.statsRow}>
              <Card style={styles.statCard}>
                <CardHeader>
                  <CardTitle style={styles.statTitle}>Net Balance</CardTitle>
                </CardHeader>
                <CardContent>
                  <Text style={[styles.statValue, data.net >= 0 ? styles.positive : styles.negative]}>
                    {formatCurrency(data.net)}
                  </Text>
                </CardContent>
              </Card>

              <Card style={styles.statCard}>
                <CardHeader>
                  <CardTitle style={styles.statTitle}>Accounts</CardTitle>
                </CardHeader>
                <CardContent>
                  <Text style={styles.statValue}>{data.accounts.length}</Text>
                  <Text style={styles.statSubtitle}>Active accounts</Text>
                </CardContent>
              </Card>
            </View>

            {/* Accounts List */}
            {data.accounts.length > 0 && (
              <Card style={styles.accountsCard}>
                <CardHeader>
                  <CardTitle>Accounts</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.accounts.map((item: any) => (
                    <View key={item.account.id} style={styles.accountItem}>
                      <View style={styles.accountInfo}>
                        <Text style={styles.accountName}>{item.account.name}</Text>
                        <Text style={styles.accountKind}>{item.account.kind}</Text>
                      </View>
                      <Text style={[styles.accountBalance, item.balance >= 0 ? styles.positive : styles.negative]}>
                        {formatCurrency(item.balance)}
                      </Text>
                    </View>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </ScrollView>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
  },
  errorCard: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
  },
  errorText: {
    color: '#dc2626',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
  },
  statTitle: {
    fontSize: 14,
    color: '#666',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  statSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  positive: {
    color: '#22c55e',
  },
  negative: {
    color: '#ef4444',
  },
  accountsCard: {
    marginTop: 8,
  },
  accountItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  accountKind: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  accountBalance: {
    fontSize: 16,
    fontWeight: '600',
  },
})