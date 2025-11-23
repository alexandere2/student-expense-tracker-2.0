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

// Task 2: Show Total Spending (Overall & By Catgeory)
  const loadExpenses = async () => {
    const { sql, params } = buildFilterQuery('SELECT * FROM expenses');
    const rows = await db.getAllAsync(sql, params);

    // Make sure "amount" is numeric 
    const parsed = rows.map((r) => ({ ...r, amount: Number(r.amount) }));
    setExpenses(parsed);

    // Update totals after loading 
    computeTotals(parsed);
  };

  //Compute Totals + Category Breakdowns (Re-runs whenever list or filter changes)
  const computeTotals = async (currentExpenses) => {
    // Calculate total amount
    const totalSum = currentExpenses.reduce(
      (acc, e) => acc + (Number(e.amount) || 0),
      0
      );
    setToal(totalSum);
    // Compute totals per category 
    const categoryMap = {};
    currentExpenses.forEach((e) => {
      const c = e.category || 'Other';
      categoryMap[c] = (categoryMap[c] || 0) + Number(e.amount);
    });

    const categoryArray = Object.entries(categoryMap).map(([category, sum]) => ({
      category,
      sum,
    }));

    setByCategory(categoryArray);
  };

  //Add New Expense (Automatically applies today's date)
  const addExpense = async () => {
    const amountNumber = parseFloat(amount);
    if (isNaN(amountNumber) || amountNumber <= 0) {
      // Basic validation: ignore invalid or non-positive amounts
      return Alert.alert("Invalid Amount", "Enter a positive nunber.");
    }

    const trimmedCategory = category.trim();
    const trimmedNote = note.trim();

    if (!trimmedCategory) {
      // Category is required
      return Alert.alert("Category Required", "Enter a category.");
    }

    const today = formatDateISO ();
    
    await db.runAsync(
      'INSERT INTO expenses (amount, category, note, date) VALUES (?, ?, ?);',
      [amountNumber, trimmedCategory, trimmedNote || null, today]
    );

    // Reset inputs
    setAmount('');
    setCategory('');
    setNote('');

    loadExpenses();
  };

// Delete Expense 
  const deleteExpense = async (id) => {
    await db.runAsync('DELETE FROM expenses WHERE id = ?;', [id]);
    loadExpenses();
  };

// Task 3: Allow Editing Existing Expenses (UPDATE)
  const startEdit = (exp) => {
    setEditingExpense(exp);
    setEditAmount(String(exp.amount));
    setEditingCategory(exp.category);
    setEditNote(exp.note || '');
    setEditDate(exp.date || formatDateISO());
  };

  // Save Changes (SQLite Update)
  const saveEdit = async() => {
    if (!editingExpense) return;

    const amountNum = parseFloat(editAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return Alert.alert("Invalid Amount", "Enter a positive number.");
    }

    if (!editCategory.trim()) {
      return Alert.alert("Category Required", "Enter a category.");
    }
    
    await db.runAsync(
      `UPDATE expenses
      SET amount = ?, category = ?. note = ?, date = ?
      WHERE id = ?;`,
      [amountNum, editCategory.trim(), editNote || null, editDate, editingExpense.id]
      );

    setEditingExpense(null);
    loadExpenses();
  };

  // Initial load: Ensure schema + load expenses
  useEffect(() => {
    (async () => {
      await ensureSchema();
      await loadExpenses();
    })();
  }, []);

  // Re-load when filter changes
  useEffect(() => {
    loadExpenses();
  }, [filter]);

  // Render Each Expense Row 
  const renderExpense = ({ item }) => (
   <TouchableOpacity
      style={styles.expenseRow}
      onPress={() => startEdit(item)}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.expenseAmount}>${item.amount.toFixed(2)}</Text>
        <Text style={styles.expenseCategory}>
          {item.category} • {item.date}
        </Text>
        {item.note ? <Text style={styles.expenseNote}>{item.note}</Text> : null}
      </View>

      <TouchableOpacity onPress={() => deleteExpense(item.id)}>
        <Text style={styles.delete}>✕</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );


  // Main Render
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>Student Expense Tracker</Text>

      // Add New Expense Form 
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Amount (e.g. 12.50)"
          keyboardType="numeric"
          value={amount}
          onChangeText={setAmount}
        />
        <TextInput
          style={styles.input}
          placeholder="Category"
          value={category}
          onChangeText={setCategory}
        />
        <TextInput
          style={styles.input}
          placeholder="Note (optional)"
          value={note}
          onChangeText={setNote}
        />
        <Button title="Add Expense" onPress={addExpense} />
      </View>

      // Filter Buttons 
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterBtn, filter === 'all' && styles.filterActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={styles.filterText}>All</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterBtn, filter === 'week' && styles.filterActive]}
          onPress={() => setFilter('week')}
        >
          <Text style={styles.filterText}>This Week</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterBtn, filter === 'month' && styles.filterActive]}
          onPress={() => setFilter('month')}
        >
          <Text style={styles.filterText}>This Month</Text>
        </TouchableOpacity>
      </View>

     // Totals Section
      <View style={styles.totals}>
        <Text style={styles.totalHeading}>
          Total ({filter === 'all' ? 'All' : filter === 'week' ? 'This Week' : 'This Month'}):
          ${total.toFixed(2)}
        </Text>

        <Text style={styles.subHeading}>By Category:</Text>
        {byCategory.length === 0 ? (
          <Text style={styles.emptySmall}>No data for this filter</Text>
        ) : (
          byCategory.map((c) => (
            <Text key={c.category} style={styles.catRow}>
              • {c.category}: ${c.sum.toFixed(2)}
            </Text>
          ))
        )}
      </View>

      // Expense List
      <FlatList
        data={expenses}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderExpense}
        ListEmptyComponent={<Text style={styles.empty}>No expenses found.</Text>}
      />

      // Edit Modal 
      <Modal visible={!!editingExpense} transparent animationType="slide">
        <View style={styles.modalBack}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Edit Expense</Text>

            <TextInput
              style={styles.input}
              placeholder="Amount"
              keyboardType="numeric"
              value={editAmount}
              onChangeText={setEditAmount}
            />

            <TextInput
              style={styles.input}
              placeholder="Category"
              value={editCategory}
              onChangeText={setEditCategory}
            />

            <TextInput
              style={styles.input}
              placeholder="Note"
              value={editNote}
              onChangeText={setEditNote}
            />

            <TextInput
              style={styles.input}
              placeholder="Date (YYYY-MM-DD)"
              value={editDate}
              onChangeText={setEditDate}
            />

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                style={styles.modalBtn}
                onPress={() => setEditingExpense(null)}
              >
                <Text style={styles.modalBtnText}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.modalBtn, styles.modalSave]}
                onPress={saveEdit}
              >
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>
                  Save
                </Text>
              </Pressable>
            </View>

          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}


// Styles Sheet 
const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#0b1220' },

  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },

  // Add Form
  form: { marginBottom: 12 },
  input: {
    padding: 10,
    backgroundColor: '#121826',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2b3240',
    color: '#fff',
    marginBottom: 8,
  },

  // Expense Rows
  expenseRow: {
    flexDirection: 'row',
    backgroundColor: '#121826',
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
  },
  expenseAmount: { fontSize: 18, color: '#fbbf24', fontWeight: '700' },
  expenseCategory: { color: '#e5e7eb' },
  expenseNote: { color: '#9ca3af', fontSize: 12 },
  delete: { color: '#f87171', fontSize: 20, paddingLeft: 10 },

  // Filters
  filterRow: { flexDirection: 'row', marginBottom: 8 },
  filterBtn: {
    flex: 1,
    padding: 10,
    marginHorizontal: 4,
    backgroundColor: '#1f2937',
    borderRadius: 8,
    alignItems: 'center',
  },
  filterActive: { backgroundColor: '#374151' },
  filterText: { color: '#fff', fontWeight: '600' },

  // Totals Section
  totals: {
    backgroundColor: '#0f1724',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  totalHeading: { color: '#fff', fontWeight: '700', marginBottom: 6 },
  subHeading: { color: '#9ca3af', marginBottom: 6 },
  catRow: { color: '#e5e7eb' },
  emptySmall: { color: '#9ca3af' },

  empty: { color: '#9ca3af', textAlign: 'center', marginTop: 20 },

  // Edit Modal 
  modalBack: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#0b1220',
    padding: 16,
    borderRadius: 12,
  },
  modalTitle: { color: '#fff', fontSize: 18, marginBottom: 10 },

  modalBtn: {
    flex: 1,
    backgroundColor: '#1f2937',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalBtnText: { color: '#fff' },
  modalSave: { backgroundColor: '#10b981' },
});
