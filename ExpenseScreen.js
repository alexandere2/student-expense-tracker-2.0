// ExpenseScreen.js
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
import CategoryChart from './CategoryChart';

// Task 1A: Add a date Column to the Expenses Table
function formatDateISO(d = new Date()) {
  // Returns date as YYYY-MM-DD
  const year = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${year}-${m}-${day}`;
}

function startOfWeekISO(date = new Date()) {
  // Week Starts on Sunday
  const d = new Date(date);
  const day = d.getDay(); // 0 (Sun) - 6 (Sat)
  d.setDate(d.getDate() - day);
  return formatDateISO(d);
}

// End of the week
function endOfWeekISO(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (6 - day));
  return formatDateISO(d);
}

function startOfMonthISO(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1); // First day of the month
  return formatDateISO(d);
}

function endOfMonthISO(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0); // Last day of the month
  return formatDateISO(d);
}

export default function ExpenseScreen() {
  const db = useSQLiteContext();

  // State for list + Add Form
  const [expenses, setExpenses] = useState([]);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');

  // Task 1B: Implement Filters: 'All' / This Week / This Month 
  const [filter, setFilter] = useState('all');

  // totals
  const [total, setTotal] = useState(0);
  const [byCategory, setByCategory] = useState([]);

  // edit modal
  const [editingExpense, setEditingExpense] = useState(null);
  const [editAmount, setEditAmount] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editDate, setEditDate] = useState(formatDateISO());

  // helper: create/upgrade table to include date column
  const ensureSchema = async () => {
    // create table if missing (without date) then ensure date column exists
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        note TEXT
      );
    `);

    // check if 'date' column exists; if not add it.
    // PRAGMA table_info returns rows with 'name' property
    const info = await db.getAllAsync(`PRAGMA table_info(expenses);`);
    const hasDate = (info || []).some((r) => r.name === 'date');

    if (!hasDate) {
      // Add column. Existing rows will have NULL; we'll leave them
      // You could later backfill or drop DB if preferred.
      try {
        await db.execAsync(`ALTER TABLE expenses ADD COLUMN date TEXT;`);
      } catch (e) {
        // ALTER may fail if column already exists in some SQLite builds — ignore error
        console.warn('Could not add date column (maybe already exists)', e);
      }
    }

    // Ensure when date is null for legacy rows, we set today's date
    try {
      await db.execAsync(`
        UPDATE expenses
        SET date = ?
        WHERE date IS NULL OR date = '';
      `, [formatDateISO()]);
    } catch (e) {
      // ignore
    }
  };

  // Task 2: Show Total Spending (Overall & By Category)
  const buildFilterQuery = (baseSelect = 'SELECT * FROM expenses', forTotals = false) => {
    if (filter === 'all') {
      return { sql: `${baseSelect} ORDER BY id DESC;`, params: [] };
    }

    const now = new Date();
    let start, end;
    if (filter === 'week') {
      start = startOfWeekISO(now);
      end = endOfWeekISO(now);
    } else if (filter === 'month') {
      start = startOfMonthISO(now);
      end = endOfMonthISO(now);
    }

    if (forTotals) {
      // caller will set grouping or selection; provide WHERE clause fragment
      return {
        sql: `${baseSelect} WHERE date BETWEEN ? AND ?`,
        params: [start, end],
      };
    } else {
      return {
        sql: `${baseSelect} WHERE date BETWEEN ? AND ? ORDER BY id DESC;`,
        params: [start, end],
      };
    }
  };

  const loadExpenses = async () => {
    const { sql, params } = buildFilterQuery('SELECT * FROM expenses');
    const rows = await db.getAllAsync(sql, params);
    // ensure amount is number (sometimes comes as string)
    const parsed = (rows || []).map(r => ({ ...r, amount: Number(r.amount) }));
    setExpenses(parsed);
    await computeTotals(parsed);
  };

  const computeTotals = async (currentExpenses = null) => {
    if (currentExpenses) {
      const totalSum = currentExpenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
      setTotal(totalSum);

      const cat = {};
      for (const e of currentExpenses) {
        const c = e.category || 'Other';
        cat[c] = (cat[c] || 0) + (Number(e.amount) || 0);
      }
      const catArray = Object.entries(cat).map(([category, sum]) => ({ category, sum }));
      setByCategory(catArray);
      return;
    }
    
    if (filter === 'all') {
      const totalRes = await db.getAllAsync('SELECT SUM(amount) as sum FROM expenses;');
      const sum = (totalRes && totalRes[0] && totalRes[0].sum) ? Number(totalRes[0].sum) : 0;
      setTotal(sum);

      const catRes = await db.getAllAsync('SELECT category, SUM(amount) as sum FROM expenses GROUP BY category;');
      setByCategory((catRes || []).map(r => ({ category: r.category, sum: Number(r.sum) })));
    } else {
      // week or month
      const { sql: whereSql, params } = buildFilterQuery('SELECT * FROM expenses', true);
      const totalSql = `SELECT SUM(amount) as sum FROM expenses WHERE date BETWEEN ? AND ?;`;
      const totalRes = await db.getAllAsync(totalSql, params);
      const sum = (totalRes && totalRes[0] && totalRes[0].sum) ? Number(totalRes[0].sum) : 0;
      setTotal(sum);

      const catSql = `SELECT category, SUM(amount) as sum FROM expenses WHERE date BETWEEN ? AND ? GROUP BY category;`;
      const catRes = await db.getAllAsync(catSql, params);
      setByCategory((catRes || []).map(r => ({ category: r.category, sum: Number(r.sum) })));
    }
  };

  // Add Expenses
  const addExpense = async () => {
    const amountNumber = parseFloat(amount);

    if (isNaN(amountNumber) || amountNumber <= 0) {
      Alert.alert('Invalid amount', 'Please enter a positive number for the amount.');
      return;
    }

    const trimmedCategory = category.trim();
    const trimmedNote = note.trim();

    if (!trimmedCategory) {
      Alert.alert('Category required', 'Please enter a category.');
      return;
    }

    const isoDate = formatDateISO(new Date()); // default to today

    await db.runAsync(
      'INSERT INTO expenses (amount, category, note, date) VALUES (?, ?, ?, ?);',
      [amountNumber, trimmedCategory, trimmedNote || null, isoDate]
    );

    setAmount('');
    setCategory('');
    setNote('');

    await loadExpenses();
  };

  // Delete Expenses 
  const deleteExpense = async (id) => {
    await db.runAsync('DELETE FROM expenses WHERE id = ?;', [id]);
    await loadExpenses();
  };

  // Task 3: Allow Editing Existing Expenses (UPDATE)
  const openEdit = (item) => {
    setEditingExpense(item);
    setEditAmount(String(item.amount));
    setEditCategory(item.category || '');
    setEditNote(item.note || '');
    setEditDate(item.date || formatDateISO());
  };

  const saveEdit = async () => {
    if (!editingExpense) return;

    const amountNumber = parseFloat(editAmount);
    if (isNaN(amountNumber) || amountNumber <= 0) {
      Alert.alert('Invalid amount', 'Please enter a positive number for the amount.');
      return;
    }
    const trimmedCat = editCategory.trim();
    if (!trimmedCat) {
      Alert.alert('Category required', 'Please enter a category.');
      return;
    }
    const isoDate = editDate || formatDateISO();

    await db.runAsync(
      `UPDATE expenses SET amount = ?, category = ?, note = ?, date = ? WHERE id = ?;`,
      [amountNumber, trimmedCat, editNote || null, isoDate, editingExpense.id]
    );

    setEditingExpense(null);
    await loadExpenses();
  };

  // When filter changes, reload expenses and totals
  useEffect(() => {
    async function setup() {
      await ensureSchema();
      await loadExpenses();
    }
    setup();
  }, []);

  useEffect(() => {
    // reload whenever filter changes
    loadExpenses();
  }, [filter]);

  const renderExpense = ({ item }) => (
    <TouchableOpacity onPress={() => openEdit(item)} style={styles.expenseRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.expenseAmount}>${Number(item.amount).toFixed(2)}</Text>
        <Text style={styles.expenseCategory}>{item.category} • {item.date}</Text>
        {item.note ? <Text style={styles.expenseNote}>{item.note}</Text> : null}
      </View>

      <TouchableOpacity onPress={() => deleteExpense(item.id)}>
        <Text style={styles.delete}>✕</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>Student Expense Tracker</Text>
      <View style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 22, fontWeight: '600', color: '#fff', marginBottom: 10 }}>Expense By Category</Text>
        <Text style ={{ color: '#9ca3af', marginBottom: 10 }}>Total: ${total.toFixed(2)}</Text>
        <CategoryChart data={byCategory} />
      </View>
    
      // Add Form
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
        <Button title="Add Expense (uses today's date)" onPress={addExpense} />
      </View>

      // Filters
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

      // Totals
      <View style={styles.totals}>
        <Text style={styles.totalHeading}>
          Total ({filter === 'all' ? 'All' : filter === 'week' ? 'This Week' : 'This Month'}): ${total.toFixed(2)}
        </Text>
        <Text style={styles.subHeading}>By Category:</Text>
        {(byCategory.length === 0) ? (
          <Text style={styles.emptySmall}>No category data.</Text>
        ) : (
          byCategory.map((c) => (
            <Text key={c.category} style={styles.catRow}>
              • {c.category}: ${Number(c.sum).toFixed(2)}
            </Text>
          ))
        )}
      </View>

      <FlatList
        data={expenses}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderExpense}
        ListEmptyComponent={<Text style={styles.empty}>No expenses yet.</Text>}
        contentContainerStyle={{ paddingBottom: 80 }}
      />

      <Text style={styles.footer}>
        Tap a row to edit an expense. Deleting will remove it from local SQLite.
      </Text>

      // Edit Modal
      <Modal
        visible={!!editingExpense}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEditingExpense(null)}
      >
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
              placeholder="Note (optional)"
              value={editNote}
              onChangeText={setEditNote}
            />
            <TextInput
              style={styles.input}
              placeholder="Date (YYYY-MM-DD)"
              value={editDate}
              onChangeText={setEditDate}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <Pressable style={styles.modalBtn} onPress={() => setEditingExpense(null)}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, styles.modalSave]} onPress={saveEdit}>
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>Save</Text>
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
  form: {
    marginBottom: 12,
    gap: 8,
  },
  input: {
    padding: 10,
    backgroundColor: '#121826',
    color: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2b3240',
    marginBottom: 6,
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#121826',
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
    color: '#9ca3af',
    marginTop: 12,
    fontSize: 12,
  },

  filterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  filterBtn: {
    flex: 1,
    padding: 10,
    margin: 4,
    borderRadius: 8,
    backgroundColor: '#1f2937',
    alignItems: 'center',
  },
  filterActive: {
    backgroundColor: '#374151',
  },
  filterText: {
    color: '#fff',
    fontWeight: '600',
  },
  totals: {
    backgroundColor: '#0f1724',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  totalHeading: {
    color: '#fff',
    fontWeight: '700',
    marginBottom: 6,
  },
  subHeading: {
    color: '#9ca3af',
    fontSize: 12,
    marginBottom: 6,
  },
  emptySmall: {
    color: '#9ca3af',
  },
  catRow: {
    color: '#e5e7eb',
  },

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
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  modalBtn: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#1f2937',
    flex: 1,
    alignItems: 'center',
  },
  modalBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
  modalSave: {
    backgroundColor: '#10b981',
    marginLeft: 8,
  },
});
