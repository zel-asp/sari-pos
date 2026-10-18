import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import Svg, {
  Path,
  Line,
  Circle,
  Text as SvgText,
  Defs,
  LinearGradient,
  Stop,
  G,
} from 'react-native-svg';
import { formatPHP } from '@/utils/currency';
import { type ChartDataPoint } from '@/database/repositories/analytics-repository';

interface MultiLineChartProps {
  data: ChartDataPoint[];
  height?: number;
}

export function MultiLineChart({ data, height = 260 }: MultiLineChartProps) {
  const { width: windowWidth } = useWindowDimensions();
  // Responsive width calculation: chart card width minus padding
  const chartWidth = Math.min(windowWidth - 48, 860);

  const [visibleLines, setVisibleLines] = useState<{
    inflows: boolean;
    capital: boolean;
    losses: boolean;
  }>({
    inflows: true,
    capital: true,
    losses: true,
  });

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <View style={[styles.emptyContainer, { height }]}>
        <Text style={styles.emptyText}>No data points to plot for this period.</Text>
      </View>
    );
  }

  // Padding inside chart canvas
  const paddingLeft = 58;
  const paddingRight = 24;
  const paddingTop = 24;
  const paddingBottom = 40;

  const innerWidth = chartWidth - paddingLeft - paddingRight;
  const innerHeight = height - paddingTop - paddingBottom;

  // Determine Max Y value across visible series (minimum ₱50 for scale)
  let maxYCentavos = 5000;
  data.forEach((d) => {
    if (visibleLines.inflows && d.inflowsCentavos > maxYCentavos) {
      maxYCentavos = d.inflowsCentavos;
    }
    if (visibleLines.capital && d.capitalCentavos > maxYCentavos) {
      maxYCentavos = d.capitalCentavos;
    }
    if (visibleLines.losses && d.lossesCentavos > maxYCentavos) {
      maxYCentavos = d.lossesCentavos;
    }
  });

  // Round up maxY for clean grid lines
  const scaleMax = Math.ceil(maxYCentavos / 1000) * 1000;

  const getX = (index: number) => {
    if (data.length <= 1) return paddingLeft + innerWidth / 2;
    return paddingLeft + (index / (data.length - 1)) * innerWidth;
  };

  const getY = (valCentavos: number) => {
    const ratio = Math.min(1, Math.max(0, valCentavos / scaleMax));
    return paddingTop + innerHeight - ratio * innerHeight;
  };

  // Build SVG path string with smooth bezier curves
  const makeSmoothPath = (values: number[]) => {
    if (values.length === 0) return '';
    const points = values.map((v, i) => ({ x: getX(i), y: getY(v) }));

    if (points.length === 1) {
      return `M ${points[0].x} ${points[0].y}`;
    }

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i === 0 ? 0 : i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return d;
  };

  const inflowsPath = makeSmoothPath(data.map((d) => d.inflowsCentavos));
  const capitalPath = makeSmoothPath(data.map((d) => d.capitalCentavos));
  const lossesPath = makeSmoothPath(data.map((d) => d.lossesCentavos));

  // Area under inflows line
  const inflowsAreaPath =
    inflowsPath && data.length > 1
      ? `${inflowsPath} L ${getX(data.length - 1)} ${paddingTop + innerHeight} L ${getX(0)} ${
          paddingTop + innerHeight
        } Z`
      : '';

  // Grid steps (4 horizontal levels)
  const gridSteps = [0, 0.33, 0.66, 1];

  const selectedItem =
    selectedIndex !== null && selectedIndex >= 0 && selectedIndex < data.length
      ? data[selectedIndex]
      : null;

  return (
    <View style={styles.cardWrapper}>
      {/* Legend & Series Filter Toggles */}
      <View style={styles.legendRow}>
        {/* Inflows Toggle */}
        <Pressable
          onPress={() =>
            setVisibleLines((prev) => ({ ...prev, inflows: !prev.inflows }))
          }
          style={[
            styles.legendPill,
            visibleLines.inflows && styles.legendPillActiveInflows,
          ]}
        >
          <View style={[styles.legendDot, { backgroundColor: '#10b981' }]} />
          <Text
            style={[
              styles.legendText,
              visibleLines.inflows && styles.legendTextActive,
            ]}
          >
            Inflows (Sales + Utang)
          </Text>
        </Pressable>

        {/* Capital Toggle */}
        <Pressable
          onPress={() =>
            setVisibleLines((prev) => ({ ...prev, capital: !prev.capital }))
          }
          style={[
            styles.legendPill,
            visibleLines.capital && styles.legendPillActiveCapital,
          ]}
        >
          <View style={[styles.legendDot, { backgroundColor: '#3b82f6' }]} />
          <Text
            style={[
              styles.legendText,
              visibleLines.capital && styles.legendTextActive,
            ]}
          >
            Capital (Restocks)
          </Text>
        </Pressable>

        {/* Losses Toggle */}
        <Pressable
          onPress={() =>
            setVisibleLines((prev) => ({ ...prev, losses: !prev.losses }))
          }
          style={[
            styles.legendPill,
            visibleLines.losses && styles.legendPillActiveLosses,
          ]}
        >
          <View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} />
          <Text
            style={[
              styles.legendText,
              visibleLines.losses && styles.legendTextActive,
            ]}
          >
            Losses (Damage)
          </Text>
        </Pressable>
      </View>

      {/* Interactive Tooltip Card when hovering/touching a point */}
      {selectedItem ? (
        <View style={styles.tooltipBox}>
          <View style={styles.tooltipHeaderRow}>
            <Text style={styles.tooltipTitle}>{selectedItem.fullDate}</Text>
            <Pressable onPress={() => setSelectedIndex(null)}>
              <Text style={styles.tooltipClose}>Close</Text>
            </Pressable>
          </View>
          <View style={styles.tooltipValuesGrid}>
            <View style={styles.tooltipMetric}>
              <Text style={[styles.tooltipMetricLabel, { color: '#059669' }]}>
                Inflow (Gain)
              </Text>
              <Text style={styles.tooltipMetricVal}>
                {formatPHP(selectedItem.inflowsCentavos)}
              </Text>
            </View>
            <View style={styles.tooltipMetric}>
              <Text style={[styles.tooltipMetricLabel, { color: '#2563eb' }]}>
                Capital Stocked
              </Text>
              <Text style={styles.tooltipMetricVal}>
                {formatPHP(selectedItem.capitalCentavos)}
              </Text>
            </View>
            <View style={styles.tooltipMetric}>
              <Text style={[styles.tooltipMetricLabel, { color: '#dc2626' }]}>
                Losses (Cost)
              </Text>
              <Text style={styles.tooltipMetricVal}>
                {formatPHP(selectedItem.lossesCentavos)}
              </Text>
            </View>
            <View style={styles.tooltipMetric}>
              <Text style={styles.tooltipMetricLabel}>Net Margin</Text>
              <Text
                style={[
                  styles.tooltipMetricVal,
                  {
                    color:
                      selectedItem.inflowsCentavos -
                        (selectedItem.capitalCentavos + selectedItem.lossesCentavos) >=
                      0
                        ? '#059669'
                        : '#dc2626',
                  },
                ]}
              >
                {formatPHP(
                  selectedItem.inflowsCentavos -
                    (selectedItem.capitalCentavos + selectedItem.lossesCentavos)
                )}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* SVG Canvas and Interactive Pressable Overlay */}
      <View style={[styles.canvasContainer, { width: chartWidth, height }]}>
        <Svg width={chartWidth} height={height} style={styles.svg}>
          <Defs>
            <LinearGradient id="inflowsGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#10b981" stopOpacity="0.25" />
              <Stop offset="1" stopColor="#10b981" stopOpacity="0.0" />
            </LinearGradient>
          </Defs>

          {/* Horizontal Grid Lines & Y-Axis Labels */}
          {gridSteps.map((step, idx) => {
            const y = paddingTop + innerHeight - step * innerHeight;
            const valCentavos = Math.round(step * scaleMax);
            const formatted =
              valCentavos >= 100000
                ? `₱${(valCentavos / 100000).toFixed(0)}k`
                : formatPHP(valCentavos);

            return (
              <G key={`grid-${idx}`}>
                <Line
                  x1={paddingLeft}
                  y1={y}
                  x2={chartWidth - paddingRight}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                />
                <SvgText
                  x={paddingLeft - 8}
                  y={y + 4}
                  fontSize={10}
                  fill="#94a3b8"
                  textAnchor="end"
                  fontWeight="500"
                >
                  {formatted}
                </SvgText>
              </G>
            );
          })}

          {/* Inflows Gradient Fill */}
          {visibleLines.inflows && inflowsAreaPath ? (
            <Path d={inflowsAreaPath} fill="url(#inflowsGrad)" />
          ) : null}

          {/* 1. Capital Invested Line (Blue) */}
          {visibleLines.capital && capitalPath ? (
            <Path
              d={capitalPath}
              fill="none"
              stroke="#3b82f6"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {/* 2. Losses Line (Rose/Red) */}
          {visibleLines.losses && lossesPath ? (
            <Path
              d={lossesPath}
              fill="none"
              stroke="#ef4444"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {/* 3. Inflows / Gain Line (Emerald Green) */}
          {visibleLines.inflows && inflowsPath ? (
            <Path
              d={inflowsPath}
              fill="none"
              stroke="#10b981"
              strokeWidth={3.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {/* Data Points and Visual Indicators */}
          {data.map((d, i) => {
            const cx = getX(i);
            const cyInflows = getY(d.inflowsCentavos);
            const cyCapital = getY(d.capitalCentavos);
            const cyLosses = getY(d.lossesCentavos);
            const isSelected = selectedIndex === i;

            return (
              <G key={`point-${i}`}>
                {/* Active column highlight bar */}
                {isSelected ? (
                  <Line
                    x1={cx}
                    y1={paddingTop}
                    x2={cx}
                    y2={paddingTop + innerHeight}
                    stroke="#cbd5e1"
                    strokeWidth={1.5}
                    strokeDasharray="2 2"
                  />
                ) : null}

                {/* Capital Dot */}
                {visibleLines.capital ? (
                  <Circle
                    cx={cx}
                    cy={cyCapital}
                    r={isSelected ? 6 : 3.5}
                    fill="#ffffff"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                  />
                ) : null}

                {/* Losses Dot */}
                {visibleLines.losses ? (
                  <Circle
                    cx={cx}
                    cy={cyLosses}
                    r={isSelected ? 6 : 3.5}
                    fill="#ffffff"
                    stroke="#ef4444"
                    strokeWidth={2.5}
                  />
                ) : null}

                {/* Inflows Dot */}
                {visibleLines.inflows ? (
                  <Circle
                    cx={cx}
                    cy={cyInflows}
                    r={isSelected ? 6.5 : 4}
                    fill="#ffffff"
                    stroke="#10b981"
                    strokeWidth={3}
                  />
                ) : null}

                {/* X-Axis Label */}
                <SvgText
                  x={cx}
                  y={height - 12}
                  fontSize={10}
                  fill={isSelected ? '#059669' : '#64748b'}
                  fontWeight={isSelected ? '800' : '600'}
                  textAnchor="middle"
                >
                  {d.label}
                </SvgText>
              </G>
            );
          })}
        </Svg>

        {/* Clean Web & Mobile Compatible Pressable Overlay */}
        {data.map((d, i) => {
          const cx = getX(i);
          const colWidth = innerWidth / (data.length || 1);
          return (
            <Pressable
              key={`touch-col-${i}`}
              onPress={() => setSelectedIndex(i)}
              style={[
                styles.touchColumn,
                {
                  left: cx - colWidth / 2,
                  top: paddingTop,
                  width: colWidth,
                  height: innerHeight + 20,
                },
              ]}
              accessibilityLabel={`Select date ${d.label}`}
            />
          );
        })}
      </View>

      <Text style={styles.chartFootnote}>
        Tap any data point on the chart to inspect exact breakdown for that date.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  legendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    opacity: 0.5,
  },
  legendPillActiveInflows: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    opacity: 1,
  },
  legendPillActiveCapital: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
    opacity: 1,
  },
  legendPillActiveLosses: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    opacity: 1,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  legendTextActive: {
    color: '#0f172a',
    fontWeight: '700',
  },
  tooltipBox: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  tooltipHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    paddingBottom: 6,
  },
  tooltipTitle: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700',
  },
  tooltipClose: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  tooltipValuesGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  tooltipMetric: {
    minWidth: '22%',
  },
  tooltipMetricLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 2,
  },
  tooltipMetricVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#f8fafc',
  },
  canvasContainer: {
    position: 'relative',
    alignSelf: 'center',
  },
  touchColumn: {
    position: 'absolute',
    backgroundColor: 'transparent',
    cursor: 'pointer' as any,
  },
  svg: {
    alignSelf: 'center',
  },
  chartFootnote: {
    textAlign: 'center',
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 8,
    fontStyle: 'italic',
  },
});
