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

test('renders due filter control', () => {
  render(<App />);
  const dueFilter = screen.getByLabelText(/Filter by due/i);
  expect(dueFilter).toBeInTheDocument();
});
