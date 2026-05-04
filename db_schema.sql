-- =============================================
-- REKAP DSAJA - Production Dashboard Schema
-- =============================================

CREATE DATABASE IF NOT EXISTS timbangan
  CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

USE timbangan;

-- -------------------------------------------------
-- Table: production_daily
-- Tracks daily production per item per shift
-- -------------------------------------------------
DROP TABLE IF EXISTS production_daily;
CREATE TABLE production_daily (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tanggal DATE NOT NULL,
    item_name VARCHAR(100) NOT NULL,
    item_category VARCHAR(50) DEFAULT 'production',
    shift1_tonase DECIMAL(12,2) DEFAULT 0,
    shift1_ritase INT DEFAULT 0,
    shift2_tonase DECIMAL(12,2) DEFAULT 0,
    shift2_ritase INT DEFAULT 0,
    shift3_tonase DECIMAL(12,2) DEFAULT 0,
    shift3_ritase INT DEFAULT 0,
    color_code VARCHAR(20) DEFAULT NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_date_item (tanggal, item_name)
) ENGINE=InnoDB;

-- -------------------------------------------------
-- Table: vendor_daily
-- Tracks vendor deliveries per shift
-- -------------------------------------------------
DROP TABLE IF EXISTS vendor_daily;
CREATE TABLE vendor_daily (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tanggal DATE NOT NULL,
    vendor_name VARCHAR(100) NOT NULL,
    section_name VARCHAR(100) NOT NULL,
    shift1_rit INT DEFAULT 0,
    shift1_kg DECIMAL(12,2) DEFAULT 0,
    shift2_rit INT DEFAULT 0,
    shift2_kg DECIMAL(12,2) DEFAULT 0,
    shift3_rit INT DEFAULT 0,
    shift3_kg DECIMAL(12,2) DEFAULT 0,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_date_vendor_section (tanggal, vendor_name, section_name)
) ENGINE=InnoDB;

-- -------------------------------------------------
-- Table: vendor_todate
-- Running totals per vendor
-- -------------------------------------------------
DROP TABLE IF EXISTS vendor_todate;
CREATE TABLE vendor_todate (
    id INT AUTO_INCREMENT PRIMARY KEY,
    vendor_name VARCHAR(100) NOT NULL,
    ritase INT DEFAULT 0,
    ritase_unit VARCHAR(20) DEFAULT 'TRUCK',
    netto DECIMAL(14,2) DEFAULT 0,
    netto_unit VARCHAR(20) DEFAULT 'KG',
    balance DECIMAL(14,2) DEFAULT 0,
    balance_unit VARCHAR(20) DEFAULT 'KG',
    quantity_po DECIMAL(14,2) DEFAULT 0,
    quantity_po_unit VARCHAR(20) DEFAULT 'KG',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_vendor (vendor_name)
) ENGINE=InnoDB;

-- -------------------------------------------------
-- Table: shift_config
-- Shift schedule metadata
-- -------------------------------------------------
DROP TABLE IF EXISTS shift_config;
CREATE TABLE shift_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    shift_number INT NOT NULL,
    tanggal DATE NOT NULL,
    start_time DATETIME,
    end_time DATETIME
) ENGINE=InnoDB;

-- =============================================
-- SAMPLE DATA
-- =============================================

-- Production items for today
INSERT INTO production_daily (tanggal, item_name, item_category, shift1_tonase, shift1_ritase, shift2_tonase, shift2_ritase, shift3_tonase, shift3_ritase, color_code, sort_order)
VALUES
    (CURDATE(), 'TO DAY TEBU',         'tebu',       0, 0, 0, 0, 0, 0, '#2d8f2d', 1),
    (CURDATE(), 'TO DAY BLOTONG',      'blotong',    5800, 1, 8260, 1, 7760, 1, '#e67e22', 2),
    (CURDATE(), 'FILTER CAKE 1',       'filtercake', 5800, 1, 8260, 1, 7760, 1, '#3498db', 3),
    (CURDATE(), 'FC PETANI',           'filtercake', 0, 0, 0, 0, 0, 0, '#9b59b6', 4),
    (CURDATE(), 'FILTER CAKE 2',       'filtercake', 0, 0, 0, 0, 0, 0, '#1abc9c', 5),
    (CURDATE(), 'FILTER CAKE PELATARAN','filtercake',0, 0, 0, 0, 0, 0, '#16a085', 6),
    (CURDATE(), 'TO DAY FLY ASH',      'flyash',     5800, 1, 8260, 1, 7760, 1, '#00bcd4', 7),
    (CURDATE(), 'FLY ASH PELATARAN',   'flyash',     0, 0, 0, 0, 0, 0, '#0097a7', 8),
    (CURDATE(), 'FLY ASH HOPPER 1',    'flyash',     0, 0, 0, 0, 0, 0, '#00838f', 9),
    (CURDATE(), 'FLY ASH HOPPER 2',    'flyash',     0, 0, 0, 0, 0, 0, '#006064', 10),
    (CURDATE(), 'TO DAY GULA',         'gula',       0, 0, 0, 0, 0, 0, '#f1c40f', 11),
    (CURDATE(), 'TO DAY MOLASSE',      'molasse',    0, 0, 0, 0, 0, 0, '#8d6e63', 12),
    (CURDATE(), 'TO DAY BAGASSE',      'bagasse',    0, 0, 0, 0, 0, 0, '#4caf50', 13),
    (CURDATE(), 'RAW SUGAR',           'rawsugar',   0, 0, 0, 0, 0, 0, '#e91e63', 14),
    (CURDATE(), 'GULA TRANSFER',       'gula',       0, 0, 0, 0, 0, 0, '#ff9800', 15),
    (CURDATE(), 'BATU BARA',           'batubara',   0, 0, 0, 0, 0, 0, '#607d8b', 16),
    (CURDATE(), 'RAW SUGAR 2',         'rawsugar',   0, 0, 0, 0, 0, 0, '#c62828', 17),
    (CURDATE(), 'BATU BARA 2',         'batubara',   0, 0, 0, 0, 0, 0, '#455a64', 18);

-- Vendor daily data
INSERT INTO vendor_daily (tanggal, vendor_name, section_name, shift1_rit, shift1_kg, shift2_rit, shift2_kg, shift3_rit, shift3_kg, sort_order)
VALUES
    (CURDATE(), 'FILTER CAKE',         'Filter Cake', 1, 5800, 1, 8260, 1, 7760, 1),
    (CURDATE(), 'FLYASH',              'Flyash',      0, 0, 0, 0, 0, 0, 2),
    (CURDATE(), 'MEGA RAMIN PT',       'Mega Ramin',  0, 0, 0, 0, 0, 0, 3),
    (CURDATE(), 'BARKALIN ARTHA PRIMA CV', 'Barkalin', 0, 0, 0, 0, 0, 0, 4);

-- Vendor running totals
INSERT INTO vendor_todate (vendor_name, ritase, ritase_unit, netto, netto_unit, balance, balance_unit, quantity_po, quantity_po_unit)
VALUES
    ('FILTER CAKE',         3, 'TRUCK', 21820, 'KG', 0, 'KG', 0, 'KG'),
    ('FLYASH',              0, 'TRUCK', 0, 'KG', 0, 'KG', 0, 'KG'),
    ('MEGA RAMIN PT',       225, 'TRUCK', 7599550, 'KG', -99550, 'KG', 7500000, 'KG'),
    ('BARKALIN ARTHA PRIMA CV', 213, 'TRUCK', 6809260, 'KG', 0, 'KG', 0, 'KG');

-- Shift config
INSERT INTO shift_config (shift_number, tanggal, start_time, end_time)
VALUES
    (1, CURDATE(), CONCAT(CURDATE(), ' 06:00:00'), CONCAT(CURDATE(), ' 14:00:00')),
    (2, CURDATE(), CONCAT(CURDATE(), ' 14:00:00'), CONCAT(CURDATE(), ' 22:00:00')),
    (3, CURDATE(), CONCAT(CURDATE(), ' 22:00:00'), CONCAT(DATE_ADD(CURDATE(), INTERVAL 1 DAY), ' 06:00:00'));
