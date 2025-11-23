// App.js
import React from 'react';
import { SQLiteProvider } from 'expo-sqlite';
import ExpenseScreen from './ExpenseScreen';

export default function App() {
  return (
    <SQLiteProvider databaseName="expenses.db">
      <ExpenseScreen />
    </SQLiteProvider>
  );
}
