import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  Alert,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

// TASK 1: Add a Date Column & Filter by Week / Month
function formatDateISO(d = new Date()) {
  // Returns date as "YYYY-MM-DD
  const year = d.getFullYear();
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  retrun `${year}-${month}-${day}`;

  // Beginning of current week (Sunday)
  function startOfWeekISO(date = new Date()) {
    // Week Starts on Sunday 
    const d = new Date(date);
    const day = d.getDay(); // 0 (Sun) - 6 (Sat)
    d.setDate(d.getDate() - day);
    return formatDateISO(d);
  }
  
// End of current week (Saturday)
function endOfWeeksISO(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (6 - day));
  return formatDateISO(d);
}
  
  function startOfMonthISO(date = new Date()) {
    const d = new Date(date.getFullYear(), date.getMonth(), 1); // First day of month
    return formatDateISO(d);
  }

  function endOfMonthISO(date = new Date()) {
    const d = new Date(date.getFullYear(), date.getMonth() + 1, 0); // Last day of month
    return formatDateISO(d);
  }

  // MAIN COMPONENT
export default function ExpenseScreen() {
  const db = useSQLiteContext();

  // State for list + add form 
  const [expenses, setExpenses] = useState([]);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');

  // Current selected filter: all / week / month
  const [filters, setFilter] = useState('all');

  // Calculated totals
  const [total, setTotal] = useState(0);
  const [byCategory, setByCategory] = useState([]);

  // State for editing modal 
  const [editingExpense, setEditingExpense] = useState(null);
  const [editAmount, setEditAmount] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editDate, setEditDate] = useState(formatDateISO());

// Ensures the "date' column exists (adds automatically if missing)
  const ensureSchema = async () => {
    // Create table if needed (legacy format)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      note TEXT
    );
    `);

// Check if "date" column exists
    const info = await db.getAllAsync(`PRAGMA table_info(expenses);`);
    const hasDate = info.some((column) => column.name === 'date');

// Add "date" column if missing 
    if (!hasDate) {
      try {
        await db.execAsync(`ALTER TABLE expenses ADD COLUMN date TEXT'`);
      } catch (e) {
        console.warn("Date column may already exist:", e);
      }
    }
    
  // Set default date for old rows where date is NULL
    await db.execAsync(
      `UPDATE expenses SET date = ? WHERE date IS NULL OR date = '';`,
      [formatDateISO()]
      );
  };

  // Task 1B: Implement Filters: All / This Week / This Month
  const buildFilterQuery = (baseSelect = 'SELECT * FROM expenses', totalsMode = false) => {
    if (filter === 'all') {
      // No data filtering 
      return { sql: `${baseSelect} ORDER BY id DESC;`, paramas: [] };
    }

    // Compute date ranges for week or month 
    let start, end;
    if (filter === 'week') {
      start = startOfWeekISO();
      end = endOfWeekISO();
    } else {
      start = startOfMonthISO();
      end = endOfMonthISO();
    }

    // totalsMode = caller will append custom SELECT columns 
    const whereClause = `WHERE date BETWEEN ? AND ?`;

    return totalsMode 
    ? { sql: `${baseSelect} ${whereClause}`, params: [start, end] }
      : { sql: `${baseSelect} ${whereClause} ORDER BY id DESC;`, params: [start, end] };
  };


    // Compute totals per category 
  const addExpense = async () => {
    const amountNumber = parseFloat(amount);

    if (isNaN(amountNumber) || amountNumber <= 0) {
      // Basic validation: ignore invalid or non-positive amounts
      return;
    }

    const trimmedCategory = category.trim();
    const trimmedNote = note.trim();

    if (!trimmedCategory) {
      // Category is required
      return;
    }

    await db.runAsync(
      'INSERT INTO expenses (amount, category, note) VALUES (?, ?, ?);',
      [amountNumber, trimmedCategory, trimmedNote || null]
    );

    setAmount('');
    setCategory('');
    setNote('');

    loadExpenses();
  };


  const deleteExpense = async (id) => {
    await db.runAsync('DELETE FROM expenses WHERE id = ?;', [id]);
    loadExpenses();
  };


  const renderExpense = ({ item }) => (
    <View style={styles.expenseRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.expenseAmount}>${Number(item.amount).toFixed(2)}</Text>
        <Text style={styles.expenseCategory}>{item.category}</Text>
        {item.note ? <Text style={styles.expenseNote}>{item.note}</Text> : null}
      </View>

      <TouchableOpacity onPress={() => deleteExpense(item.id)}>
        <Text style={styles.delete}>✕</Text>
      </TouchableOpacity>
    </View>
  );

  useEffect(() => {
    async function setup() {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS expenses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          amount REAL NOT NULL,
          category TEXT NOT NULL,
          note TEXT
        );
      `);

      await loadExpenses();
    }

    setup();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>Student Expense Tracker</Text>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Amount (e.g. 12.50)"
          placeholderTextColor="#9ca3af"
          keyboardType="numeric"
          value={amount}
          onChangeText={setAmount}
        />
        <TextInput
          style={styles.input}
          placeholder="Category (Food, Books, Rent...)"
          placeholderTextColor="#9ca3af"
          value={category}
          onChangeText={setCategory}
        />
        <TextInput
          style={styles.input}
          placeholder="Note (optional)"
          placeholderTextColor="#9ca3af"
          value={note}
          onChangeText={setNote}
        />
        <Button title="Add Expense" onPress={addExpense} />
      </View>

      <FlatList
        data={expenses}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderExpense}
        ListEmptyComponent={
          <Text style={styles.empty}>No expenses yet.</Text>
        }
      />

      <Text style={styles.footer}>
        Enter your expenses and they’ll be saved locally with SQLite.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#111827' },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
  },
  form: {
    marginBottom: 16,
    gap: 8,
  },
  input: {
    padding: 10,
    backgroundColor: '#1f2937',
    color: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f2937',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  expenseAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fbbf24',
  },
  expenseCategory: {
    fontSize: 14,
    color: '#e5e7eb',
  },
  expenseNote: {
    fontSize: 12,
    color: '#9ca3af',
  },
  delete: {
    color: '#f87171',
    fontSize: 20,
    marginLeft: 12,
  },
  empty: {
    color: '#9ca3af',
    marginTop: 24,
    textAlign: 'center',
  },
  footer: {
    textAlign: 'center',
    color: '#6b7280',
    marginTop: 12,
    fontSize: 12,
  },
});
