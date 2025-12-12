import { render, screen, fireEvent } from '@testing-library/react';
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

test('BroadcastChannel presence shows live pill', async () => {
  render(<App />);
  // The header should show Live pill due to mocked BroadcastChannel transport connected
  const live = await screen.findByText(/live/i);
  expect(live).toBeInTheDocument();
});
