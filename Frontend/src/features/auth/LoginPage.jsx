import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { UtensilsCrossed, Eye, EyeOff } from 'lucide-react'
import { useAppDispatch } from '@/store/hooks'
import { loginSuccess } from '@/store/slices/authSlice'
import { setSelectedBranchId } from '@/store/slices/branchesSlice'
import { loginCredentials } from '@/mock/auth'
import { loginRequest } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ThemeToggle } from '@/components/layout/ThemeToggle'

export default function LoginPage() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('admin@restaurant.com')
  const [password, setPassword] = useState('admin123')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const from = location.state?.from?.pathname || '/'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { token, user } = await loginRequest(email, password)
      dispatch(loginSuccess({ token, user }))
      if (user.branchIds?.length === 1) {
        dispatch(setSelectedBranchId(user.branchIds[0]))
      }
      toast.success(`Welcome back, ${user.name}!`)
      navigate(from, { replace: true })
    } catch {
      toast.error('Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  const fillDemo = (cred) => {
    setEmail(cred.email)
    setPassword(cred.password)
  }

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-primary relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary/90 to-orange-700" />
        <div className="relative z-10 flex flex-col justify-center px-12 text-primary-foreground">
          <div className="flex items-center gap-3 mb-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur">
              <UtensilsCrossed className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Digious Corp</h1>
              <p className="text-primary-foreground/80">Order Management Portal</p>
            </div>
          </div>
          <h2 className="text-4xl font-bold leading-tight mb-4">
            Manage your restaurant<br />with confidence
          </h2>
          <p className="text-lg text-primary-foreground/80 max-w-md">
            Orders, menu, customers, marketing, and reports — including a multi-branch switcher and a combined headquarters report.
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center p-6 bg-background relative">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>

        <Card className="w-full max-w-md border-0 shadow-lg lg:border">
          <CardHeader className="text-center lg:text-left">
            <div className="flex items-center justify-center lg:justify-start gap-2 mb-2 lg:hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <UtensilsCrossed className="h-5 w-5" />
              </div>
              <span className="text-xl font-bold">Digious Corp</span>
            </div>
            <CardTitle className="text-2xl">Sign in</CardTitle>
            <CardDescription>Enter your credentials to access the admin panel</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@restaurant.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign in'}
              </Button>
            </form>

            <div className="mt-6 rounded-lg border bg-muted/50 p-4">
              <p className="text-xs font-medium text-muted-foreground mb-3">Demo accounts (click to fill)</p>
              <div className="space-y-2">
                {loginCredentials.map((cred) => (
                  <button
                    key={cred.email}
                    type="button"
                    onClick={() => fillDemo(cred)}
                    className="w-full text-left text-xs rounded-md px-3 py-2 hover:bg-muted transition-colors"
                  >
                    <span className="font-medium capitalize">{cred.role}</span>
                    <span className="text-muted-foreground"> — {cred.email}</span>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
