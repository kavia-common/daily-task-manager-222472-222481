import { render, screen, fireEvent } from '@testing-library/react';
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

test('shows streak labels in header and Quick Notes present', () => {
  render(<App />);
  // streak chips
  expect(screen.getByText(/Current Streak/i)).toBeInTheDocument();
  expect(screen.getByText(/Best/i)).toBeInTheDocument();
  // quick notes section header
  expect(screen.getByText(/Quick Notes/i)).toBeInTheDocument();
});

test('pin control exists and pinned tasks appear first and notes button exists', () => {
  render(<App />);
  // Add two tasks
  const input = screen.getByLabelText(/New task/i);
  fireEvent.change(input, { target: { value: 'Task A' } });
  // check Pin task and add
  const pinCheckbox = screen.getByLabelText(/Pin task on creation/i);
  fireEvent.click(pinCheckbox);
  fireEvent.click(screen.getByLabelText(/Add task/i));

  // Add second task not pinned
  fireEvent.change(input, { target: { value: 'Task B' } });
  // uncheck pin if still checked
  const pinCheckbox2 = screen.getByLabelText(/Pin task on creation/i);
  if (pinCheckbox2.checked) fireEvent.click(pinCheckbox2);
  fireEvent.click(screen.getByLabelText(/Add task/i));

  // Should render a list where Task A appears before Task B
  const list = screen.getByRole('list', { name: /Tasks list/i });
  const items = Array.from(list.querySelectorAll('.item .title'));
  expect(items.length).toBeGreaterThanOrEqual(2);
  const titles = items.map((n) => n.textContent);
  // First contains Task A before Task B
  const idxA = titles.findIndex(t => t.includes('Task A'));
  const idxB = titles.findIndex(t => t.includes('Task B'));
  expect(idxA).toBeGreaterThanOrEqual(0);
  expect(idxB).toBeGreaterThanOrEqual(0);
  expect(idxA).toBeLessThan(idxB);

  // Check a notes button exists for items
  const notesButtons = screen.getAllByRole('button', { name: /notes/i });
  expect(notesButtons.length).toBeGreaterThan(0);
});
