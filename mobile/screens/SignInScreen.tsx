import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase, isSupabaseConfigured, missingSupabaseEnvMessage } from '../lib/supabaseClient'
import { useAuth } from '../lib/auth'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card'
import { Label } from '../components/ui/Label'

const schema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type FormValues = z.infer<typeof schema>

export default function SignInScreen({ navigation }: any) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const supabaseReady = isSupabaseConfigured

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: 'admin@gmail.com', password: 'admin@123' },
  })

  const onSubmit = async (values: FormValues) => {
    if (!supabaseReady) {
      Alert.alert('Configuration Error', missingSupabaseEnvMessage)
      return
    }

    setIsSubmitting(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword(values)
      
      if (error) {
        if (error.message.toLowerCase().includes('invalid')) {
          // Attempt to create the admin user automatically
          const { error: signupErr } = await supabase.auth.signUp({
            email: values.email,
            password: values.password,
            options: { data: { full_name: 'Admin' } },
          })
          if (signupErr) {
            Alert.alert(
              'Error',
              `${signupErr.message}. Create this user in Supabase Auth (Users) and mark as confirmed, then try again.`
            )
            setIsSubmitting(false)
            return
          }
          Alert.alert(
            'User Created',
            'Admin user created. If email confirmation is required, confirm the email in Supabase or disable confirmations, then sign in again.'
          )
          setIsSubmitting(false)
          return
        }
        Alert.alert('Sign In Error', error.message)
        setIsSubmitting(false)
        return
      }

      // Success - navigation will be handled by auth state change
      Alert.alert('Success', 'Signed in successfully')
    } catch (error: any) {
      Alert.alert('Error', error.message || 'An unexpected error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  const signInAsAdmin = () => {
    setValue('email', 'admin@gmail.com', { shouldValidate: true })
    setValue('password', 'admin@123', { shouldValidate: true })
    if (supabaseReady) {
      handleSubmit(onSubmit)()
    } else {
      Alert.alert('Configuration Error', missingSupabaseEnvMessage)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Card style={styles.card}>
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>Sign in to access your workspace</CardDescription>
          </CardHeader>
          <CardContent>
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Email"
                  placeholder="you@example.com"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  editable={!isSubmitting && supabaseReady}
                  error={errors.email?.message}
                />
              )}
            />

            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label="Password"
                  placeholder="Enter your password"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="password"
                  editable={!isSubmitting && supabaseReady}
                  error={errors.password?.message}
                />
              )}
            />

            <Button
              title="Sign in"
              onPress={handleSubmit(onSubmit)}
              disabled={isSubmitting || !supabaseReady}
              loading={isSubmitting}
              style={{ marginTop: 8 }}
            />

            {!supabaseReady && (
              <View style={styles.errorBox}>
                <Text style={styles.errorBoxText}>{missingSupabaseEnvMessage}</Text>
              </View>
            )}

            <View style={styles.demoBox}>
              <Label style={{ marginBottom: 8 }}>Need a quick demo?</Label>
              <Button
                title="Sign in as Admin"
                onPress={signInAsAdmin}
                disabled={isSubmitting || !supabaseReady}
                variant="outline"
                size="sm"
              />
            </View>
          </CardContent>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
  },
  errorBox: {
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  errorBoxText: {
    color: '#dc2626',
    fontSize: 12,
  },
  demoBox: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
  },
})
