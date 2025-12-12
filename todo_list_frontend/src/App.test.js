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
