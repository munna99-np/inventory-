import React from 'react'
import { Text, StyleSheet, TextStyle } from 'react-native'

interface LabelProps {
  children: React.ReactNode
  style?: TextStyle
  required?: boolean
}

export function Label({ children, style, required }: LabelProps) {
  return (
    <Text style={[styles.label, style]}>
      {children}
      {required && <Text style={styles.required}> *</Text>}
    </Text>
  )
}

const styles = StyleSheet.create({
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  required: {
    color: '#ef4444',
  },
})
