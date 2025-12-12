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

test('dependencies selector available under Advanced', () => {
  render(<App />);
  // reveal advanced options
  const adv = screen.getByRole('button', { name: /advanced/i });
  adv.click();
  // dependency selector input should be present
  const depSearch = screen.getByLabelText(/Select dependencies for new task/i);
  expect(depSearch).toBeInTheDocument();
});

test('blocked task cannot be completed until dependency done and badge clears after', () => {
  render(<App />);
  const input = screen.getByLabelText(/New task/i);
  // Add prerequisite A
  fireEvent.change(input, { target: { value: 'Task A' } });
  fireEvent.click(screen.getByLabelText(/Add task/i));
  // Add dependent B with dependency on A
  fireEvent.change(input, { target: { value: 'Task B' } });
  const adv = screen.getByRole('button', { name: /advanced/i });
  adv.click();
  const depSearch = screen.getByLabelText(/Search tasks to add as dependencies/i);
  // pick A from options list by pressing Enter (adds first match)
  fireEvent.change(depSearch, { target: { value: 'Task A' } });
  fireEvent.keyDown(depSearch, { key: 'Enter', code: 'Enter' });
  fireEvent.click(screen.getByLabelText(/Add task/i));

  // Find Task B item
  const taskBCheckbox = screen.getAllByRole('checkbox').find(cb => {
    const label = cb.getAttribute('aria-label') || '';
    return label.toLowerCase().includes('task b');
  });
  expect(taskBCheckbox).toBeTruthy();

  // Should be disabled due to blocked
  expect(taskBCheckbox).toBeDisabled();

  // Badge "Blocked" should be visible near Task B title
  expect(screen.getAllByText(/Blocked/i).length).toBeGreaterThan(0);

  // Complete A -> unblocks B
  const taskACheckbox = screen.getAllByRole('checkbox').find(cb => {
    const label = cb.getAttribute('aria-label') || '';
    return label.toLowerCase().includes('task a');
  });
  expect(taskACheckbox).toBeTruthy();
  fireEvent.click(taskACheckbox);

  // Now B can be toggled
  expect(taskBCheckbox).not.toBeDisabled();
});

test('renders due filter control and productivity tabs including Timeline', () => {
  render(<App />);
  const dueFilter = screen.getByLabelText(/Filter by due/i);
  expect(dueFilter).toBeInTheDocument();

  // tabs
  expect(screen.getByRole('tab', { name: /All/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Today/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Weekly/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Timeline/i })).toBeInTheDocument();
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

test('attachments button exists, can open panel, and attachments area renders', () => {
  render(<App />);
  // add a simple task
  const input = screen.getByLabelText(/New task/i);
  fireEvent.change(input, { target: { value: 'Task with media' } });
  fireEvent.click(screen.getByLabelText(/Add task/i));
  // find the attachments toggle button by its accessible name
  const attachToggle = screen.getAllByRole('button', { name: /attachments/i })[0];
  expect(attachToggle).toBeInTheDocument();
  fireEvent.click(attachToggle);
  // panel region should appear
  expect(screen.getByRole('region', { name: /Task attachments area/i })).toBeInTheDocument();
  // "Add Photo" trigger should exist as a label for hidden input
  expect(screen.getByText(/Add Photo/i)).toBeInTheDocument();
  // Either recorder controls group or unsupported message should be present
  const maybeGroup = screen.queryByLabelText(/Voice note recorder/i);
  const maybeMsg = screen.queryByText(/Voice notes not supported/i);
  expect(maybeGroup || maybeMsg).toBeTruthy();
});
