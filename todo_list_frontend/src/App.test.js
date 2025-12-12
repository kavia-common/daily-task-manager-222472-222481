import { render, screen } from '@testing-library/react';
import App from './App';

test('renders app title and category filter', () => {
  render(<App />);
  const title = screen.getByText(/Daily Tasks/i);
  expect(title).toBeInTheDocument();
  // category filter select should be present
  const categoryFilter = screen.getByLabelText(/Filter by category/i);
  expect(categoryFilter).toBeInTheDocument();
});

test('renders due filter control and productivity tabs', () => {
  render(<App />);
  const dueFilter = screen.getByLabelText(/Filter by due/i);
  expect(dueFilter).toBeInTheDocument();

  // new tabs
  expect(screen.getByRole('tab', { name: /All/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Today/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Weekly/i })).toBeInTheDocument();
});

test('shows streak labels in header', () => {
  render(<App />);
  // streak chips
  expect(screen.getByText(/Current Streak/i)).toBeInTheDocument();
  expect(screen.getByText(/Best/i)).toBeInTheDocument();
});
