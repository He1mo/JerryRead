import { render, screen } from '@testing-library/react'
import { App } from './App'

describe('App', () => {
  it('展示项目名称和当前里程碑', () => {
    render(<App />)

    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByText('JerryRead')).toBeInTheDocument()
    expect(screen.getByText('项目已启动')).toBeInTheDocument()
    expect(screen.getByText('下一站：Supabase')).toBeInTheDocument()
  })
})
