import { render, screen, fireEvent, act } from '@testing-library/react';
import App from './App';

beforeEach(() => {
  // Clear storages and set mock BroadcastChannel
  localStorage.clear();
  const listeners = [];
  const mock = {
    postMessage: (msg) => setTimeout(() => listeners.forEach((cb) => cb({ data: msg })), 0),
    close: jest.fn(),
    set onmessage(cb) { listeners.push(cb); },
  };
  window.BroadcastChannel = jest.fn().mockImplementation(() => mock);
});

test('renders input and add button', () => {
  render(<App />);
  const input = screen.getByPlaceholderText(/add a new task/i);
  const button = screen.getByRole('button', { name: /add task/i });
  expect(input).toBeInTheDocument();
  expect(button).toBeInTheDocument();
});

test('Assign button appears on todo item and selector opens', () => {
  render(<App />);
  const input = screen.getByPlaceholderText(/add a new task/i);
  fireEvent.change(input, { target: { value: 'Task with assignees' } });
  fireEvent.click(screen.getByRole('button', { name: /add task/i }));
  const assignBtn = screen.getByText('Assign');
  expect(assignBtn).toBeInTheDocument();
  fireEvent.click(assignBtn);
  expect(screen.getByRole('dialog', { name: /Assign users/i })).toBeInTheDocument();
});

test('Assignee chips render after selection', () => {
  render(<App />);
  const input = screen.getByPlaceholderText(/add a new task/i);
  fireEvent.change(input, { target: { value: 'Task A' } });
  fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' }); // add quickly via Enter from input

  const assignBtn = screen.getByText('Assign');
  fireEvent.click(assignBtn);

  const fieldLabel = screen.getByText(/Assignees/i);
  const container = fieldLabel.parentElement;
  const textInput = container.querySelector('input[type="text"]');
  fireEvent.change(textInput, { target: { value: 'alice' } });
  fireEvent.keyDown(textInput, { key: 'Enter', code: 'Enter' });

  // an avatar chip with initials AL should appear
  const initials = screen.getAllByText(/AL/i);
  expect(initials.length).toBeGreaterThan(0);
});

test('Archive tab renders', () => {
  render(<App />);
  expect(screen.getByRole('tab', { name: /archive/i })).toBeInTheDocument();
});

test('History tab renders and filters exist', () => {
  render(<App />);
  const tab = screen.getByRole('tab', { name: /history/i });
  expect(tab).toBeInTheDocument();
  fireEvent.click(tab);
  expect(screen.getByLabelText(/history from date/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/history to date/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/quick date presets/i)).toBeInTheDocument();
});

// Empty states tests
test('All view shows “No tasks yet” when no tasks exist', () => {
  render(<App />);
  expect(screen.getByText(/No tasks yet — add your first task!/i)).toBeInTheDocument();
});

test('Timeline empty state shows when no time blocks for the selected day', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('tab', { name: /timeline/i }));
  expect(screen.getByText(/No time blocks for this day/i)).toBeInTheDocument();
});

test('History view shows empty state message when date range yields no results', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('tab', { name: /history/i }));
  // Choose a range far in the past to ensure no results
  const fromInput = screen.getByLabelText(/history from date/i);
  const toInput = screen.getByLabelText(/history to date/i);
  fireEvent.change(fromInput, { target: { value: '2000-01-01' } });
  fireEvent.change(toInput, { target: { value: '2000-01-02' } });
  expect(screen.getByText(/No completed tasks in this range/i)).toBeInTheDocument();
});

test('Completed task appears in History within date range and disappears outside', () => {
  render(<App />);
  // add a task and mark complete
  const input = screen.getByPlaceholderText(/add a new task/i);
  fireEvent.change(input, { target: { value: 'History Check' } });
  fireEvent.click(screen.getByRole('button', { name: /add task/i }));

  const cb = screen.getByRole('checkbox', { name: /mark history check as complete/i });
  fireEvent.click(cb);

  // open History tab
  fireEvent.click(screen.getByRole('tab', { name: /history/i }));

  // preset today should include it
  const rowNow = screen.getByText(/History Check/i);
  expect(rowNow).toBeInTheDocument();

  // set range outside today
  const today = new Date();
  const toISODate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const fromInput = screen.getByLabelText(/history from date/i);
  const toInput = screen.getByLabelText(/history to date/i);
  const past = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 10);
  const past2 = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 9);
  fireEvent.change(fromInput, { target: { value: toISODate(past) } });
  fireEvent.change(toInput, { target: { value: toISODate(past2) } });

  expect(screen.queryByText(/History Check/i)).not.toBeInTheDocument();
});

test('Auto-archive moves an old completed task, restore and delete work', () => {
  jest.useFakeTimers();
  render(<App />);
  const input = screen.getByPlaceholderText(/add a new task/i);
  fireEvent.change(input, { target: { value: 'Old Completed Task' } });
  fireEvent.click(screen.getByRole('button', { name: /add task/i }));

  // mark complete
  const checkbox = screen.getByRole('checkbox', { name: /mark old completed task as complete/i });
  fireEvent.click(checkbox);

  // simulate 11 days pass
  const now = new Date();
  const past = new Date(now.getTime() + 11 * 24 * 60 * 60 * 1000);
  jest.setSystemTime(past);

  // open Archive tab and run manual auto-archive button to avoid waiting interval
  fireEvent.click(screen.getByRole('tab', { name: /archive/i }));
  const runBtn = screen.getByRole('button', { name: /run auto-archive now/i });
  fireEvent.click(runBtn);

  // task should appear in archive
  expect(screen.getByText(/Old Completed Task/i)).toBeInTheDocument();

  // restore brings back to All tab
  const restoreBtn = screen.getByRole('button', { name: /restore task from archive/i });
  fireEvent.click(restoreBtn);
  fireEvent.click(screen.getByRole('tab', { name: /all/i }));
  expect(screen.getByText(/Old Completed Task/i)).toBeInTheDocument();

  // go back to archive (should be gone)
  fireEvent.click(screen.getByRole('tab', { name: /archive/i }));
  expect(screen.queryByText(/Old Completed Task/i)).not.toBeInTheDocument();

  // archive again to test delete permanently: mark complete and advance time
  fireEvent.click(screen.getByRole('tab', { name: /all/i }));
  const cb2 = screen.getByRole('checkbox', { name: /mark old completed task as complete/i });
  fireEvent.click(cb2);
  jest.setSystemTime(new Date(past.getTime() + 11 * 24 * 60 * 60 * 1000));
  fireEvent.click(screen.getByRole('tab', { name: /archive/i }));
  fireEvent.click(screen.getByRole('button', { name: /run auto-archive now/i }));
  // now delete permanently
  const deleteBtn = screen.getByRole('button', { name: /delete permanently/i });
  fireEvent.click(deleteBtn);
  expect(screen.queryByText(/Old Completed Task/i)).not.toBeInTheDocument();
  jest.useRealTimers();
});

test('Completing a task increases points and First Steps badge appears', async () => {
  jest.useFakeTimers();
  render(<App />);

  const input = screen.getByPlaceholderText(/add a new task/i);
  fireEvent.change(input, { target: { value: 'Gamify Me' } });
  fireEvent.click(screen.getByRole('button', { name: /add task/i }));

  const checkbox = screen.getByRole('checkbox', { name: /mark gamify me as complete/i });
  fireEvent.click(checkbox);

  // Open badges panel
  const viewBadgesBtn = await screen.findByRole('button', { name: /view all badges/i });
  fireEvent.click(viewBadgesBtn);

  const panel = await screen.findByRole('dialog', { name: /badges panel/i });
  expect(panel).toBeInTheDocument();
  expect(screen.getByText(/first steps/i)).toBeInTheDocument();

  jest.useRealTimers();
});

test('Level progress renders with XP', () => {
  render(<App />);
  const levelProgress = screen.getByRole('progressbar', { name: /level progress/i });
  expect(levelProgress).toBeInTheDocument();
});

// Empty states tests
test('All view shows “No tasks yet” when no tasks exist', () => {
  render(<App />);
  expect(screen.getByText(/No tasks yet — add your first task!/i)).toBeInTheDocument();
});

test('Timeline empty state shows when no time blocks for the selected day', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('tab', { name: /timeline/i }));
  expect(screen.getByText(/No time blocks for this day/i)).toBeInTheDocument();
});

test('History view shows empty state message when date range yields no results', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('tab', { name: /history/i }));
  // Choose an old range to ensure no results
  const fromInput = screen.getByLabelText(/history from date/i);
  const toInput = screen.getByLabelText(/history to date/i);
  fireEvent.change(fromInput, { target: { value: '2000-01-01' } });
  fireEvent.change(toInput, { target: { value: '2000-01-02' } });
  expect(screen.getByText(/No completed tasks in this range/i)).toBeInTheDocument();
});
