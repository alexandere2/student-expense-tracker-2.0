// CategoryChart.js

import React from 'react';
import { View, Text, Dimensions } from 'react-native';
import { PieChart } from 'react-native-chart-kit';

export default function CategoryChart({ data }) {
    if (!data || data.length === 0) {
        return (
            <View style={{ alignItems: 'center', justifyContent: 'center', height: 200 }}>
                <Text>No category data available</Text>
            </View>
        );
    }

    const chartData = data.map((item, index) => ({
        name: item.category,
        amount: item.sum,
        color: chartColors[index % chartColors.length],
        legendFontColor: '#7F7F7F',
        legendFontSize: 15,
    }));

    return (
        <View style={{ marginVertical: 20 }}>
        <Text style={{ fontsize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 10 }}>
            Expense Distribution by Category
        </Text>

        <PieChart
            data={chartData}
            width={Dimensions.get('window').width - 40}
            height={220}
            accessor="amount"
            backgroundColor="transparent"
            paddingLeft="15"
            />
        </View>
    );
}

const chartColors = [
    '#FF6384',
    '#36A2EB',  
    '#FFCE56',
    '#4BC0C0',
    '#9966FF',
    '#FF9F40',
];
