import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  itemName?: string; // e.g. "products", "items", "records"
}

export function Pagination({
  currentPage,
  totalItems,
  pageSize = 15,
  onPageChange,
  itemName = 'products',
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  if (totalItems <= pageSize) {
    return (
      <View style={styles.singlePageContainer}>
        <Text style={styles.summaryText}>
          Showing all {totalItems} {itemName}
        </Text>
      </View>
    );
  }

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  // Generate page numbers to display (smart range around current page)
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 3) {
        pages.push(1, 2, 3, '...', totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1, '...', totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
      }
    }
    return pages;
  };

  return (
    <View style={styles.container}>
      <Text style={styles.summaryText}>
        Showing <Text style={styles.boldText}>{startItem}</Text>–
        <Text style={styles.boldText}>{endItem}</Text> of{' '}
        <Text style={styles.boldText}>{totalItems}</Text> {itemName}
      </Text>

      <View style={styles.controlsRow}>
        {/* Previous Button */}
        <Pressable
          onPress={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          style={({ pressed }) => [
            styles.navButton,
            currentPage <= 1 && styles.navButtonDisabled,
            pressed && currentPage > 1 && { opacity: 0.8 },
          ]}
        >
          <FontAwesome5
            name="chevron-left"
            size={11}
            color={currentPage <= 1 ? '#94a3b8' : '#059669'}
          />
          <Text
            style={[
              styles.navButtonText,
              currentPage <= 1 && styles.navButtonTextDisabled,
            ]}
          >
            Prev
          </Text>
        </Pressable>

        {/* Page Number Chips */}
        <View style={styles.pagesList}>
          {getPageNumbers().map((p, idx) => {
            if (typeof p === 'string') {
              return (
                <Text key={`ellipsis-${idx}`} style={styles.ellipsisText}>
                  ...
                </Text>
              );
            }

            const isActive = p === currentPage;
            return (
              <Pressable
                key={`page-${p}`}
                onPress={() => onPageChange(p)}
                style={({ pressed }) => [
                  styles.pageNumberBtn,
                  isActive && styles.pageNumberBtnActive,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text
                  style={[
                    styles.pageNumberText,
                    isActive && styles.pageNumberTextActive,
                  ]}
                >
                  {p}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Next Button */}
        <Pressable
          onPress={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          style={({ pressed }) => [
            styles.navButton,
            currentPage >= totalPages && styles.navButtonDisabled,
            pressed && currentPage < totalPages && { opacity: 0.8 },
          ]}
        >
          <Text
            style={[
              styles.navButtonText,
              currentPage >= totalPages && styles.navButtonTextDisabled,
            ]}
          >
            Next
          </Text>
          <FontAwesome5
            name="chevron-right"
            size={11}
            color={currentPage >= totalPages ? '#94a3b8' : '#059669'}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    marginTop: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  singlePageContainer: {
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 14,
  },
  summaryText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  boldText: {
    fontWeight: '700',
    color: '#0f172a',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  navButtonDisabled: {
    backgroundColor: '#f1f5f9',
    borderColor: '#e2e8f0',
  },
  navButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  navButtonTextDisabled: {
    color: '#94a3b8',
  },
  pagesList: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pageNumberBtn: {
    minWidth: 32,
    height: 32,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageNumberBtnActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  pageNumberText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  pageNumberTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  ellipsisText: {
    fontSize: 13,
    color: '#94a3b8',
    paddingHorizontal: 2,
  },
});
