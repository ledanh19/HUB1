-- =============================================
-- SEED DATA: VIETNAM ADMINISTRATIVE DIVISIONS
-- 63 Provinces + Key Districts + Sample Wards
-- Data from General Statistics Office Vietnam
-- =============================================

-- ===== PROVINCES (63 tỉnh/thành phố) =====

INSERT INTO public.vn_provinces (code, name, name_en, region, is_active) VALUES
-- MIỀN BẮC (Northern)
('01', 'Thành phố Hà Nội', 'Hanoi', 'Bắc', true),
('02', 'Tỉnh Hà Giang', 'Ha Giang', 'Bắc', true),
('04', 'Tỉnh Cao Bằng', 'Cao Bang', 'Bắc', true),
('06', 'Tỉnh Bắc Kạn', 'Bac Kan', 'Bắc', true),
('08', 'Tỉnh Tuyên Quang', 'Tuyen Quang', 'Bắc', true),
('10', 'Tỉnh Lào Cai', 'Lao Cai', 'Bắc', true),
('11', 'Tỉnh Điện Biên', 'Dien Bien', 'Bắc', true),
('12', 'Tỉnh Lai Châu', 'Lai Chau', 'Bắc', true),
('14', 'Tỉnh Sơn La', 'Son La', 'Bắc', true),
('15', 'Tỉnh Yên Bái', 'Yen Bai', 'Bắc', true),
('17', 'Tỉnh Hoà Bình', 'Hoa Binh', 'Bắc', true),
('19', 'Tỉnh Thái Nguyên', 'Thai Nguyen', 'Bắc', true),
('20', 'Tỉnh Lạng Sơn', 'Lang Son', 'Bắc', true),
('22', 'Tỉnh Quảng Ninh', 'Quang Ninh', 'Bắc', true),
('24', 'Tỉnh Bắc Giang', 'Bac Giang', 'Bắc', true),
('25', 'Tỉnh Phú Thọ', 'Phu Tho', 'Bắc', true),
('26', 'Tỉnh Vĩnh Phúc', 'Vinh Phuc', 'Bắc', true),
('27', 'Tỉnh Bắc Ninh', 'Bac Ninh', 'Bắc', true),
('30', 'Tỉnh Hải Dương', 'Hai Duong', 'Bắc', true),
('31', 'Thành phố Hải Phòng', 'Hai Phong', 'Bắc', true),
('33', 'Tỉnh Hưng Yên', 'Hung Yen', 'Bắc', true),
('34', 'Tỉnh Thái Bình', 'Thai Binh', 'Bắc', true),
('35', 'Tỉnh Hà Nam', 'Ha Nam', 'Bắc', true),
('36', 'Tỉnh Nam Định', 'Nam Dinh', 'Bắc', true),
('37', 'Tỉnh Ninh Bình', 'Ninh Binh', 'Bắc', true),
-- MIỀN TRUNG (Central)
('38', 'Tỉnh Thanh Hoá', 'Thanh Hoa', 'Trung', true),
('40', 'Tỉnh Nghệ An', 'Nghe An', 'Trung', true),
('42', 'Tỉnh Hà Tĩnh', 'Ha Tinh', 'Trung', true),
('44', 'Tỉnh Quảng Bình', 'Quang Binh', 'Trung', true),
('45', 'Tỉnh Quảng Trị', 'Quang Tri', 'Trung', true),
('46', 'Tỉnh Thừa Thiên Huế', 'Thua Thien Hue', 'Trung', true),
('48', 'Thành phố Đà Nẵng', 'Da Nang', 'Trung', true),
('49', 'Tỉnh Quảng Nam', 'Quang Nam', 'Trung', true),
('51', 'Tỉnh Quảng Ngãi', 'Quang Ngai', 'Trung', true),
('52', 'Tỉnh Bình Định', 'Binh Dinh', 'Trung', true),
('54', 'Tỉnh Phú Yên', 'Phu Yen', 'Trung', true),
('56', 'Tỉnh Khánh Hoà', 'Khanh Hoa', 'Trung', true),
('58', 'Tỉnh Ninh Thuận', 'Ninh Thuan', 'Trung', true),
('60', 'Tỉnh Bình Thuận', 'Binh Thuan', 'Trung', true),
-- TÂY NGUYÊN (Central Highlands)
('62', 'Tỉnh Kon Tum', 'Kon Tum', 'Trung', true),
('64', 'Tỉnh Gia Lai', 'Gia Lai', 'Trung', true),
('66', 'Tỉnh Đắk Lắk', 'Dak Lak', 'Trung', true),
('67', 'Tỉnh Đắk Nông', 'Dak Nong', 'Trung', true),
('68', 'Tỉnh Lâm Đồng', 'Lam Dong', 'Trung', true),
-- MIỀN NAM (Southern)
('70', 'Tỉnh Bình Phước', 'Binh Phuoc', 'Nam', true),
('72', 'Tỉnh Tây Ninh', 'Tay Ninh', 'Nam', true),
('74', 'Tỉnh Bình Dương', 'Binh Duong', 'Nam', true),
('75', 'Tỉnh Đồng Nai', 'Dong Nai', 'Nam', true),
('77', 'Tỉnh Bà Rịa - Vũng Tàu', 'Ba Ria - Vung Tau', 'Nam', true),
('79', 'Thành phố Hồ Chí Minh', 'Ho Chi Minh City', 'Nam', true),
('80', 'Tỉnh Long An', 'Long An', 'Nam', true),
('82', 'Tỉnh Tiền Giang', 'Tien Giang', 'Nam', true),
('83', 'Tỉnh Bến Tre', 'Ben Tre', 'Nam', true),
('84', 'Tỉnh Trà Vinh', 'Tra Vinh', 'Nam', true),
('86', 'Tỉnh Vĩnh Long', 'Vinh Long', 'Nam', true),
('87', 'Tỉnh Đồng Tháp', 'Dong Thap', 'Nam', true),
('89', 'Tỉnh An Giang', 'An Giang', 'Nam', true),
('91', 'Tỉnh Kiên Giang', 'Kien Giang', 'Nam', true),
('92', 'Thành phố Cần Thơ', 'Can Tho', 'Nam', true),
('93', 'Tỉnh Hậu Giang', 'Hau Giang', 'Nam', true),
('94', 'Tỉnh Sóc Trăng', 'Soc Trang', 'Nam', true),
('95', 'Tỉnh Bạc Liêu', 'Bac Lieu', 'Nam', true),
('96', 'Tỉnh Cà Mau', 'Ca Mau', 'Nam', true)
ON CONFLICT (code) DO NOTHING;

-- ===== DISTRICTS - HỒ CHÍ MINH (79) =====
INSERT INTO public.vn_districts (code, province_code, name, name_en, district_type, is_active) VALUES
-- Các quận nội thành
('760', '79', 'Quận 1', 'District 1', 'QUAN', true),
('761', '79', 'Quận 12', 'District 12', 'QUAN', true),
('764', '79', 'Quận Gò Vấp', 'Go Vap District', 'QUAN', true),
('765', '79', 'Quận Bình Thạnh', 'Binh Thanh District', 'QUAN', true),
('766', '79', 'Quận Tân Bình', 'Tan Binh District', 'QUAN', true),
('767', '79', 'Quận Tân Phú', 'Tan Phu District', 'QUAN', true),
('768', '79', 'Quận Phú Nhuận', 'Phu Nhuan District', 'QUAN', true),
('769', '79', 'Thành phố Thủ Đức', 'Thu Duc City', 'THANH_PHO', true),
('770', '79', 'Quận 3', 'District 3', 'QUAN', true),
('771', '79', 'Quận 10', 'District 10', 'QUAN', true),
('772', '79', 'Quận 11', 'District 11', 'QUAN', true),
('773', '79', 'Quận 4', 'District 4', 'QUAN', true),
('774', '79', 'Quận 5', 'District 5', 'QUAN', true),
('775', '79', 'Quận 6', 'District 6', 'QUAN', true),
('776', '79', 'Quận 8', 'District 8', 'QUAN', true),
('777', '79', 'Quận Bình Tân', 'Binh Tan District', 'QUAN', true),
('778', '79', 'Quận 7', 'District 7', 'QUAN', true),
-- Các huyện ngoại thành
('783', '79', 'Huyện Củ Chi', 'Cu Chi District', 'HUYEN', true),
('784', '79', 'Huyện Hóc Môn', 'Hoc Mon District', 'HUYEN', true),
('785', '79', 'Huyện Bình Chánh', 'Binh Chanh District', 'HUYEN', true),
('786', '79', 'Huyện Nhà Bè', 'Nha Be District', 'HUYEN', true),
('787', '79', 'Huyện Cần Giờ', 'Can Gio District', 'HUYEN', true)
ON CONFLICT (code) DO NOTHING;

-- ===== DISTRICTS - HÀ NỘI (01) =====
INSERT INTO public.vn_districts (code, province_code, name, name_en, district_type, is_active) VALUES
('001', '01', 'Quận Ba Đình', 'Ba Dinh District', 'QUAN', true),
('002', '01', 'Quận Hoàn Kiếm', 'Hoan Kiem District', 'QUAN', true),
('003', '01', 'Quận Tây Hồ', 'Tay Ho District', 'QUAN', true),
('004', '01', 'Quận Long Biên', 'Long Bien District', 'QUAN', true),
('005', '01', 'Quận Cầu Giấy', 'Cau Giay District', 'QUAN', true),
('006', '01', 'Quận Đống Đa', 'Dong Da District', 'QUAN', true),
('007', '01', 'Quận Hai Bà Trưng', 'Hai Ba Trung District', 'QUAN', true),
('008', '01', 'Quận Hoàng Mai', 'Hoang Mai District', 'QUAN', true),
('009', '01', 'Quận Thanh Xuân', 'Thanh Xuan District', 'QUAN', true),
('016', '01', 'Huyện Sóc Sơn', 'Soc Son District', 'HUYEN', true),
('017', '01', 'Huyện Đông Anh', 'Dong Anh District', 'HUYEN', true),
('018', '01', 'Huyện Gia Lâm', 'Gia Lam District', 'HUYEN', true),
('019', '01', 'Quận Nam Từ Liêm', 'Nam Tu Liem District', 'QUAN', true),
('020', '01', 'Huyện Thanh Trì', 'Thanh Tri District', 'HUYEN', true),
('021', '01', 'Quận Bắc Từ Liêm', 'Bac Tu Liem District', 'QUAN', true),
('250', '01', 'Huyện Mê Linh', 'Me Linh District', 'HUYEN', true),
('268', '01', 'Quận Hà Đông', 'Ha Dong District', 'QUAN', true),
('269', '01', 'Thị xã Sơn Tây', 'Son Tay Town', 'THI_XA', true),
('271', '01', 'Huyện Ba Vì', 'Ba Vi District', 'HUYEN', true),
('272', '01', 'Huyện Phúc Thọ', 'Phuc Tho District', 'HUYEN', true),
('273', '01', 'Huyện Đan Phượng', 'Dan Phuong District', 'HUYEN', true),
('274', '01', 'Huyện Hoài Đức', 'Hoai Duc District', 'HUYEN', true),
('275', '01', 'Huyện Quốc Oai', 'Quoc Oai District', 'HUYEN', true),
('276', '01', 'Huyện Thạch Thất', 'Thach That District', 'HUYEN', true),
('277', '01', 'Huyện Chương Mỹ', 'Chuong My District', 'HUYEN', true),
('278', '01', 'Huyện Thanh Oai', 'Thanh Oai District', 'HUYEN', true),
('279', '01', 'Huyện Thường Tín', 'Thuong Tin District', 'HUYEN', true),
('280', '01', 'Huyện Phú Xuyên', 'Phu Xuyen District', 'HUYEN', true),
('281', '01', 'Huyện Ứng Hòa', 'Ung Hoa District', 'HUYEN', true),
('282', '01', 'Huyện Mỹ Đức', 'My Duc District', 'HUYEN', true)
ON CONFLICT (code) DO NOTHING;

-- ===== DISTRICTS - ĐÀ NẴNG (48) =====
INSERT INTO public.vn_districts (code, province_code, name, name_en, district_type, is_active) VALUES
('490', '48', 'Quận Liên Chiểu', 'Lien Chieu District', 'QUAN', true),
('491', '48', 'Quận Thanh Khê', 'Thanh Khe District', 'QUAN', true),
('492', '48', 'Quận Hải Châu', 'Hai Chau District', 'QUAN', true),
('493', '48', 'Quận Sơn Trà', 'Son Tra District', 'QUAN', true),
('494', '48', 'Quận Ngũ Hành Sơn', 'Ngu Hanh Son District', 'QUAN', true),
('495', '48', 'Quận Cẩm Lệ', 'Cam Le District', 'QUAN', true),
('497', '48', 'Huyện Hòa Vang', 'Hoa Vang District', 'HUYEN', true),
('498', '48', 'Huyện Hoàng Sa', 'Hoang Sa District', 'HUYEN', true)
ON CONFLICT (code) DO NOTHING;

-- ===== WARDS - QUẬN 1, HỒ CHÍ MINH (760) =====
INSERT INTO public.vn_wards (code, district_code, name, name_en, ward_type, is_active) VALUES
('26734', '760', 'Phường Tân Định', 'Tan Dinh Ward', 'PHUONG', true),
('26737', '760', 'Phường Đa Kao', 'Da Kao Ward', 'PHUONG', true),
('26740', '760', 'Phường Bến Nghé', 'Ben Nghe Ward', 'PHUONG', true),
('26743', '760', 'Phường Bến Thành', 'Ben Thanh Ward', 'PHUONG', true),
('26746', '760', 'Phường Nguyễn Thái Bình', 'Nguyen Thai Binh Ward', 'PHUONG', true),
('26749', '760', 'Phường Phạm Ngũ Lão', 'Pham Ngu Lao Ward', 'PHUONG', true),
('26752', '760', 'Phường Cầu Ông Lãnh', 'Cau Ong Lanh Ward', 'PHUONG', true),
('26755', '760', 'Phường Cô Giang', 'Co Giang Ward', 'PHUONG', true),
('26758', '760', 'Phường Nguyễn Cư Trinh', 'Nguyen Cu Trinh Ward', 'PHUONG', true),
('26761', '760', 'Phường Cầu Kho', 'Cau Kho Ward', 'PHUONG', true)
ON CONFLICT (code) DO NOTHING;

-- ===== WARDS - QUẬN 3, HỒ CHÍ MINH (770) =====
INSERT INTO public.vn_wards (code, district_code, name, name_en, ward_type, is_active) VALUES
('26995', '770', 'Phường 01', 'Ward 01', 'PHUONG', true),
('26998', '770', 'Phường 02', 'Ward 02', 'PHUONG', true),
('27001', '770', 'Phường 03', 'Ward 03', 'PHUONG', true),
('27004', '770', 'Phường 04', 'Ward 04', 'PHUONG', true),
('27007', '770', 'Phường 05', 'Ward 05', 'PHUONG', true),
('27010', '770', 'Phường 09', 'Ward 09', 'PHUONG', true),
('27013', '770', 'Phường 10', 'Ward 10', 'PHUONG', true),
('27016', '770', 'Phường 11', 'Ward 11', 'PHUONG', true),
('27019', '770', 'Phường 12', 'Ward 12', 'PHUONG', true),
('27022', '770', 'Phường 13', 'Ward 13', 'PHUONG', true),
('27025', '770', 'Phường 14', 'Ward 14', 'PHUONG', true),
('27028', '770', 'Phường Võ Thị Sáu', 'Vo Thi Sau Ward', 'PHUONG', true)
ON CONFLICT (code) DO NOTHING;

-- ===== WARDS - QUẬN 7, HỒ CHÍ MINH (778) =====
INSERT INTO public.vn_wards (code, district_code, name, name_en, ward_type, is_active) VALUES
('27376', '778', 'Phường Tân Thuận Đông', 'Tan Thuan Dong Ward', 'PHUONG', true),
('27379', '778', 'Phường Tân Thuận Tây', 'Tan Thuan Tay Ward', 'PHUONG', true),
('27382', '778', 'Phường Tân Kiểng', 'Tan Kieng Ward', 'PHUONG', true),
('27385', '778', 'Phường Tân Hưng', 'Tan Hung Ward', 'PHUONG', true),
('27388', '778', 'Phường Bình Thuận', 'Binh Thuan Ward', 'PHUONG', true),
('27391', '778', 'Phường Tân Quy', 'Tan Quy Ward', 'PHUONG', true),
('27394', '778', 'Phường Phú Thuận', 'Phu Thuan Ward', 'PHUONG', true),
('27397', '778', 'Phường Tân Phú', 'Tan Phu Ward', 'PHUONG', true),
('27400', '778', 'Phường Tân Phong', 'Tan Phong Ward', 'PHUONG', true),
('27403', '778', 'Phường Phú Mỹ', 'Phu My Ward', 'PHUONG', true)
ON CONFLICT (code) DO NOTHING;

-- ===== WARDS - THỦ ĐỨC, HỒ CHÍ MINH (769) =====
INSERT INTO public.vn_wards (code, district_code, name, name_en, ward_type, is_active) VALUES
('26794', '769', 'Phường Linh Xuân', 'Linh Xuan Ward', 'PHUONG', true),
('26797', '769', 'Phường Bình Chiểu', 'Binh Chieu Ward', 'PHUONG', true),
('26800', '769', 'Phường Linh Trung', 'Linh Trung Ward', 'PHUONG', true),
('26803', '769', 'Phường Tam Bình', 'Tam Binh Ward', 'PHUONG', true),
('26806', '769', 'Phường Tam Phú', 'Tam Phu Ward', 'PHUONG', true),
('26809', '769', 'Phường Hiệp Bình Phước', 'Hiep Binh Phuoc Ward', 'PHUONG', true),
('26812', '769', 'Phường Hiệp Bình Chánh', 'Hiep Binh Chanh Ward', 'PHUONG', true),
('26815', '769', 'Phường Linh Chiểu', 'Linh Chieu Ward', 'PHUONG', true),
('26818', '769', 'Phường Linh Tây', 'Linh Tay Ward', 'PHUONG', true),
('26821', '769', 'Phường Linh Đông', 'Linh Dong Ward', 'PHUONG', true),
('26824', '769', 'Phường Bình Thọ', 'Binh Tho Ward', 'PHUONG', true),
('26827', '769', 'Phường Trường Thọ', 'Truong Tho Ward', 'PHUONG', true),
('26830', '769', 'Phường Long Bình', 'Long Binh Ward', 'PHUONG', true),
('26833', '769', 'Phường Long Thạnh Mỹ', 'Long Thanh My Ward', 'PHUONG', true),
('26836', '769', 'Phường Tân Phú', 'Tan Phu Ward', 'PHUONG', true),
('26839', '769', 'Phường Hiệp Phú', 'Hiep Phu Ward', 'PHUONG', true),
('26842', '769', 'Phường Tăng Nhơn Phú A', 'Tang Nhon Phu A Ward', 'PHUONG', true),
('26845', '769', 'Phường Tăng Nhơn Phú B', 'Tang Nhon Phu B Ward', 'PHUONG', true),
('26848', '769', 'Phường Phước Long B', 'Phuoc Long B Ward', 'PHUONG', true),
('26851', '769', 'Phường Phước Long A', 'Phuoc Long A Ward', 'PHUONG', true),
('26854', '769', 'Phường Trường Thạnh', 'Truong Thanh Ward', 'PHUONG', true),
('26857', '769', 'Phường Long Phước', 'Long Phuoc Ward', 'PHUONG', true),
('26860', '769', 'Phường Long Trường', 'Long Truong Ward', 'PHUONG', true),
('26863', '769', 'Phường Phước Bình', 'Phuoc Binh Ward', 'PHUONG', true),
('26866', '769', 'Phường Phú Hữu', 'Phu Huu Ward', 'PHUONG', true),
('26869', '769', 'Phường Thảo Điền', 'Thao Dien Ward', 'PHUONG', true),
('26872', '769', 'Phường An Phú', 'An Phu Ward', 'PHUONG', true),
('26875', '769', 'Phường An Khánh', 'An Khanh Ward', 'PHUONG', true),
('26878', '769', 'Phường Bình Trưng Đông', 'Binh Trung Dong Ward', 'PHUONG', true),
('26881', '769', 'Phường Bình Trưng Tây', 'Binh Trung Tay Ward', 'PHUONG', true),
('26884', '769', 'Phường Cát Lái', 'Cat Lai Ward', 'PHUONG', true),
('26887', '769', 'Phường Thạnh Mỹ Lợi', 'Thanh My Loi Ward', 'PHUONG', true),
('26890', '769', 'Phường An Lợi Đông', 'An Loi Dong Ward', 'PHUONG', true),
('26893', '769', 'Phường Thủ Thiêm', 'Thu Thiem Ward', 'PHUONG', true)
ON CONFLICT (code) DO NOTHING;

-- ===== WARDS - QUẬN BÌNH THẠNH, HỒ CHÍ MINH (765) =====
INSERT INTO public.vn_wards (code, district_code, name, name_en, ward_type, is_active) VALUES
('26896', '765', 'Phường 01', 'Ward 01', 'PHUONG', true),
('26899', '765', 'Phường 02', 'Ward 02', 'PHUONG', true),
('26902', '765', 'Phường 03', 'Ward 03', 'PHUONG', true),
('26905', '765', 'Phường 05', 'Ward 05', 'PHUONG', true),
('26908', '765', 'Phường 06', 'Ward 06', 'PHUONG', true),
('26911', '765', 'Phường 07', 'Ward 07', 'PHUONG', true),
('26914', '765', 'Phường 11', 'Ward 11', 'PHUONG', true),
('26917', '765', 'Phường 12', 'Ward 12', 'PHUONG', true),
('26920', '765', 'Phường 13', 'Ward 13', 'PHUONG', true),
('26923', '765', 'Phường 14', 'Ward 14', 'PHUONG', true),
('26926', '765', 'Phường 15', 'Ward 15', 'PHUONG', true),
('26929', '765', 'Phường 17', 'Ward 17', 'PHUONG', true),
('26932', '765', 'Phường 19', 'Ward 19', 'PHUONG', true),
('26935', '765', 'Phường 21', 'Ward 21', 'PHUONG', true),
('26938', '765', 'Phường 22', 'Ward 22', 'PHUONG', true),
('26941', '765', 'Phường 24', 'Ward 24', 'PHUONG', true),
('26944', '765', 'Phường 25', 'Ward 25', 'PHUONG', true),
('26947', '765', 'Phường 26', 'Ward 26', 'PHUONG', true),
('26950', '765', 'Phường 27', 'Ward 27', 'PHUONG', true),
('26953', '765', 'Phường 28', 'Ward 28', 'PHUONG', true)
ON CONFLICT (code) DO NOTHING;

-- ===== WARDS - QUẬN GÒ VẤP, HỒ CHÍ MINH (764) =====
INSERT INTO public.vn_wards (code, district_code, name, name_en, ward_type, is_active) VALUES
('26956', '764', 'Phường 01', 'Ward 01', 'PHUONG', true),
('26959', '764', 'Phường 03', 'Ward 03', 'PHUONG', true),
('26962', '764', 'Phường 04', 'Ward 04', 'PHUONG', true),
('26965', '764', 'Phường 05', 'Ward 05', 'PHUONG', true),
('26968', '764', 'Phường 06', 'Ward 06', 'PHUONG', true),
('26971', '764', 'Phường 07', 'Ward 07', 'PHUONG', true),
('26974', '764', 'Phường 08', 'Ward 08', 'PHUONG', true),
('26977', '764', 'Phường 09', 'Ward 09', 'PHUONG', true),
('26980', '764', 'Phường 10', 'Ward 10', 'PHUONG', true),
('26983', '764', 'Phường 11', 'Ward 11', 'PHUONG', true),
('26986', '764', 'Phường 12', 'Ward 12', 'PHUONG', true),
('26989', '764', 'Phường 13', 'Ward 13', 'PHUONG', true),
('26992', '764', 'Phường 14', 'Ward 14', 'PHUONG', true),
('26995', '764', 'Phường 15', 'Ward 15', 'PHUONG', true),
('26998', '764', 'Phường 16', 'Ward 16', 'PHUONG', true),
('27001', '764', 'Phường 17', 'Ward 17', 'PHUONG', true)
ON CONFLICT (code) DO NOTHING;

-- ===== WARDS - QUẬN TÂN BÌNH, HỒ CHÍ MINH (766) =====
INSERT INTO public.vn_wards (code, district_code, name, name_en, ward_type, is_active) VALUES
('27031', '766', 'Phường 01', 'Ward 01', 'PHUONG', true),
('27034', '766', 'Phường 02', 'Ward 02', 'PHUONG', true),
('27037', '766', 'Phường 03', 'Ward 03', 'PHUONG', true),
('27040', '766', 'Phường 04', 'Ward 04', 'PHUONG', true),
('27043', '766', 'Phường 05', 'Ward 05', 'PHUONG', true),
('27046', '766', 'Phường 06', 'Ward 06', 'PHUONG', true),
('27049', '766', 'Phường 07', 'Ward 07', 'PHUONG', true),
('27052', '766', 'Phường 08', 'Ward 08', 'PHUONG', true),
('27055', '766', 'Phường 09', 'Ward 09', 'PHUONG', true),
('27058', '766', 'Phường 10', 'Ward 10', 'PHUONG', true),
('27061', '766', 'Phường 11', 'Ward 11', 'PHUONG', true),
('27064', '766', 'Phường 12', 'Ward 12', 'PHUONG', true),
('27067', '766', 'Phường 13', 'Ward 13', 'PHUONG', true),
('27070', '766', 'Phường 14', 'Ward 14', 'PHUONG', true),
('27073', '766', 'Phường 15', 'Ward 15', 'PHUONG', true)
ON CONFLICT (code) DO NOTHING;

-- ===== WARDS - QUẬN TÂN PHÚ, HỒ CHÍ MINH (767) =====
INSERT INTO public.vn_wards (code, district_code, name, name_en, ward_type, is_active) VALUES
('27076', '767', 'Phường Tân Sơn Nhì', 'Tan Son Nhi Ward', 'PHUONG', true),
('27079', '767', 'Phường Tây Thạnh', 'Tay Thanh Ward', 'PHUONG', true),
('27082', '767', 'Phường Sơn Kỳ', 'Son Ky Ward', 'PHUONG', true),
('27085', '767', 'Phường Tân Quý', 'Tan Quy Ward', 'PHUONG', true),
('27088', '767', 'Phường Tân Thành', 'Tan Thanh Ward', 'PHUONG', true),
('27091', '767', 'Phường Phú Thọ Hòa', 'Phu Tho Hoa Ward', 'PHUONG', true),
('27094', '767', 'Phường Phú Thạnh', 'Phu Thanh Ward', 'PHUONG', true),
('27097', '767', 'Phường Phú Trung', 'Phu Trung Ward', 'PHUONG', true),
('27100', '767', 'Phường Hòa Thạnh', 'Hoa Thanh Ward', 'PHUONG', true),
('27103', '767', 'Phường Hiệp Tân', 'Hiep Tan Ward', 'PHUONG', true),
('27106', '767', 'Phường Tân Thới Hòa', 'Tan Thoi Hoa Ward', 'PHUONG', true)
ON CONFLICT (code) DO NOTHING;

-- ===== WARDS - QUẬN PHÚ NHUẬN, HỒ CHÍ MINH (768) =====
INSERT INTO public.vn_wards (code, district_code, name, name_en, ward_type, is_active) VALUES
('27109', '768', 'Phường 01', 'Ward 01', 'PHUONG', true),
('27112', '768', 'Phường 02', 'Ward 02', 'PHUONG', true),
('27115', '768', 'Phường 03', 'Ward 03', 'PHUONG', true),
('27118', '768', 'Phường 04', 'Ward 04', 'PHUONG', true),
('27121', '768', 'Phường 05', 'Ward 05', 'PHUONG', true),
('27124', '768', 'Phường 07', 'Ward 07', 'PHUONG', true),
('27127', '768', 'Phường 08', 'Ward 08', 'PHUONG', true),
('27130', '768', 'Phường 09', 'Ward 09', 'PHUONG', true),
('27133', '768', 'Phường 10', 'Ward 10', 'PHUONG', true),
('27136', '768', 'Phường 11', 'Ward 11', 'PHUONG', true),
('27139', '768', 'Phường 13', 'Ward 13', 'PHUONG', true),
('27142', '768', 'Phường 14', 'Ward 14', 'PHUONG', true),
('27145', '768', 'Phường 15', 'Ward 15', 'PHUONG', true),
('27148', '768', 'Phường 17', 'Ward 17', 'PHUONG', true)
ON CONFLICT (code) DO NOTHING;

-- ===== WARDS - QUẬN 12, HỒ CHÍ MINH (761) =====
INSERT INTO public.vn_wards (code, district_code, name, name_en, ward_type, is_active) VALUES
('27151', '761', 'Phường Thạnh Xuân', 'Thanh Xuan Ward', 'PHUONG', true),
('27154', '761', 'Phường Thạnh Lộc', 'Thanh Loc Ward', 'PHUONG', true),
('27157', '761', 'Phường Hiệp Thành', 'Hiep Thanh Ward', 'PHUONG', true),
('27160', '761', 'Phường Thới An', 'Thoi An Ward', 'PHUONG', true),
('27163', '761', 'Phường Tân Chánh Hiệp', 'Tan Chanh Hiep Ward', 'PHUONG', true),
('27166', '761', 'Phường An Phú Đông', 'An Phu Dong Ward', 'PHUONG', true),
('27169', '761', 'Phường Tân Thới Hiệp', 'Tan Thoi Hiep Ward', 'PHUONG', true),
('27172', '761', 'Phường Trung Mỹ Tây', 'Trung My Tay Ward', 'PHUONG', true),
('27175', '761', 'Phường Tân Hưng Thuận', 'Tan Hung Thuan Ward', 'PHUONG', true),
('27178', '761', 'Phường Đông Hưng Thuận', 'Dong Hung Thuan Ward', 'PHUONG', true),
('27181', '761', 'Phường Tân Thới Nhất', 'Tan Thoi Nhat Ward', 'PHUONG', true)
ON CONFLICT (code) DO NOTHING;

-- ===== WARDS - QUẬN 10, HỒ CHÍ MINH (771) =====
INSERT INTO public.vn_wards (code, district_code, name, name_en, ward_type, is_active) VALUES
('27184', '771', 'Phường 01', 'Ward 01', 'PHUONG', true),
('27187', '771', 'Phường 02', 'Ward 02', 'PHUONG', true),
('27190', '771', 'Phường 04', 'Ward 04', 'PHUONG', true),
('27193', '771', 'Phường 05', 'Ward 05', 'PHUONG', true),
('27196', '771', 'Phường 06', 'Ward 06', 'PHUONG', true),
('27199', '771', 'Phường 07', 'Ward 07', 'PHUONG', true),
('27202', '771', 'Phường 08', 'Ward 08', 'PHUONG', true),
('27205', '771', 'Phường 09', 'Ward 09', 'PHUONG', true),
('27208', '771', 'Phường 10', 'Ward 10', 'PHUONG', true),
('27211', '771', 'Phường 11', 'Ward 11', 'PHUONG', true),
('27214', '771', 'Phường 12', 'Ward 12', 'PHUONG', true),
('27217', '771', 'Phường 13', 'Ward 13', 'PHUONG', true),
('27220', '771', 'Phường 14', 'Ward 14', 'PHUONG', true),
('27223', '771', 'Phường 15', 'Ward 15', 'PHUONG', true)
ON CONFLICT (code) DO NOTHING;

-- ===== WARDS - QUẬN 11, HỒ CHÍ MINH (772) =====
INSERT INTO public.vn_wards (code, district_code, name, name_en, ward_type, is_active) VALUES
('27226', '772', 'Phường 01', 'Ward 01', 'PHUONG', true),
('27229', '772', 'Phường 02', 'Ward 02', 'PHUONG', true),
('27232', '772', 'Phường 03', 'Ward 03', 'PHUONG', true),
('27235', '772', 'Phường 04', 'Ward 04', 'PHUONG', true),
('27238', '772', 'Phường 05', 'Ward 05', 'PHUONG', true),
('27241', '772', 'Phường 06', 'Ward 06', 'PHUONG', true),
('27244', '772', 'Phường 07', 'Ward 07', 'PHUONG', true),
('27247', '772', 'Phường 08', 'Ward 08', 'PHUONG', true),
('27250', '772', 'Phường 09', 'Ward 09', 'PHUONG', true),
('27253', '772', 'Phường 10', 'Ward 10', 'PHUONG', true),
('27256', '772', 'Phường 11', 'Ward 11', 'PHUONG', true),
('27259', '772', 'Phường 12', 'Ward 12', 'PHUONG', true),
('27262', '772', 'Phường 13', 'Ward 13', 'PHUONG', true),
('27265', '772', 'Phường 14', 'Ward 14', 'PHUONG', true),
('27268', '772', 'Phường 15', 'Ward 15', 'PHUONG', true),
('27271', '772', 'Phường 16', 'Ward 16', 'PHUONG', true)
ON CONFLICT (code) DO NOTHING;

-- ===== WARDS - QUẬN 4, HỒ CHÍ MINH (773) =====
INSERT INTO public.vn_wards (code, district_code, name, name_en, ward_type, is_active) VALUES
('27274', '773', 'Phường 01', 'Ward 01', 'PHUONG', true),
('27277', '773', 'Phường 02', 'Ward 02', 'PHUONG', true),
('27280', '773', 'Phường 03', 'Ward 03', 'PHUONG', true),
('27283', '773', 'Phường 04', 'Ward 04', 'PHUONG', true),
('27286', '773', 'Phường 06', 'Ward 06', 'PHUONG', true),
('27289', '773', 'Phường 08', 'Ward 08', 'PHUONG', true),
('27292', '773', 'Phường 09', 'Ward 09', 'PHUONG', true),
('27295', '773', 'Phường 10', 'Ward 10', 'PHUONG', true),
('27298', '773', 'Phường 13', 'Ward 13', 'PHUONG', true),
('27301', '773', 'Phường 14', 'Ward 14', 'PHUONG', true),
('27304', '773', 'Phường 15', 'Ward 15', 'PHUONG', true),
('27307', '773', 'Phường 16', 'Ward 16', 'PHUONG', true),
('27310', '773', 'Phường 18', 'Ward 18', 'PHUONG', true)
ON CONFLICT (code) DO NOTHING;

-- ===== WARDS - QUẬN 5, HỒ CHÍ MINH (774) =====
INSERT INTO public.vn_wards (code, district_code, name, name_en, ward_type, is_active) VALUES
('27313', '774', 'Phường 01', 'Ward 01', 'PHUONG', true),
('27316', '774', 'Phường 02', 'Ward 02', 'PHUONG', true),
('27319', '774', 'Phường 03', 'Ward 03', 'PHUONG', true),
('27322', '774', 'Phường 04', 'Ward 04', 'PHUONG', true),
('27325', '774', 'Phường 05', 'Ward 05', 'PHUONG', true),
('27328', '774', 'Phường 06', 'Ward 06', 'PHUONG', true),
('27331', '774', 'Phường 07', 'Ward 07', 'PHUONG', true),
('27334', '774', 'Phường 08', 'Ward 08', 'PHUONG', true),
('27337', '774', 'Phường 09', 'Ward 09', 'PHUONG', true),
('27340', '774', 'Phường 10', 'Ward 10', 'PHUONG', true),
('27343', '774', 'Phường 11', 'Ward 11', 'PHUONG', true),
('27346', '774', 'Phường 12', 'Ward 12', 'PHUONG', true),
('27349', '774', 'Phường 13', 'Ward 13', 'PHUONG', true),
('27352', '774', 'Phường 14', 'Ward 14', 'PHUONG', true),
('27355', '774', 'Phường 15', 'Ward 15', 'PHUONG', true)
ON CONFLICT (code) DO NOTHING;

-- ===== WARDS - QUẬN 6, HỒ CHÍ MINH (775) =====
INSERT INTO public.vn_wards (code, district_code, name, name_en, ward_type, is_active) VALUES
('27358', '775', 'Phường 01', 'Ward 01', 'PHUONG', true),
('27361', '775', 'Phường 02', 'Ward 02', 'PHUONG', true),
('27364', '775', 'Phường 03', 'Ward 03', 'PHUONG', true),
('27367', '775', 'Phường 04', 'Ward 04', 'PHUONG', true),
('27370', '775', 'Phường 05', 'Ward 05', 'PHUONG', true),
('27373', '775', 'Phường 06', 'Ward 06', 'PHUONG', true),
('27376', '775', 'Phường 07', 'Ward 07', 'PHUONG', true),
('27379', '775', 'Phường 08', 'Ward 08', 'PHUONG', true),
('27382', '775', 'Phường 09', 'Ward 09', 'PHUONG', true),
('27385', '775', 'Phường 10', 'Ward 10', 'PHUONG', true),
('27388', '775', 'Phường 11', 'Ward 11', 'PHUONG', true),
('27391', '775', 'Phường 12', 'Ward 12', 'PHUONG', true),
('27394', '775', 'Phường 13', 'Ward 13', 'PHUONG', true),
('27397', '775', 'Phường 14', 'Ward 14', 'PHUONG', true)
ON CONFLICT (code) DO NOTHING;

-- ===== WARDS - QUẬN 8, HỒ CHÍ MINH (776) =====
INSERT INTO public.vn_wards (code, district_code, name, name_en, ward_type, is_active) VALUES
('27400', '776', 'Phường 01', 'Ward 01', 'PHUONG', true),
('27403', '776', 'Phường 02', 'Ward 02', 'PHUONG', true),
('27406', '776', 'Phường 03', 'Ward 03', 'PHUONG', true),
('27409', '776', 'Phường 04', 'Ward 04', 'PHUONG', true),
('27412', '776', 'Phường 05', 'Ward 05', 'PHUONG', true),
('27415', '776', 'Phường 06', 'Ward 06', 'PHUONG', true),
('27418', '776', 'Phường 07', 'Ward 07', 'PHUONG', true),
('27421', '776', 'Phường 08', 'Ward 08', 'PHUONG', true),
('27424', '776', 'Phường 09', 'Ward 09', 'PHUONG', true),
('27427', '776', 'Phường 10', 'Ward 10', 'PHUONG', true),
('27430', '776', 'Phường 11', 'Ward 11', 'PHUONG', true),
('27433', '776', 'Phường 12', 'Ward 12', 'PHUONG', true),
('27436', '776', 'Phường 13', 'Ward 13', 'PHUONG', true),
('27439', '776', 'Phường 14', 'Ward 14', 'PHUONG', true),
('27442', '776', 'Phường 15', 'Ward 15', 'PHUONG', true),
('27445', '776', 'Phường 16', 'Ward 16', 'PHUONG', true)
ON CONFLICT (code) DO NOTHING;

-- ===== WARDS - QUẬN BÌNH TÂN, HỒ CHÍ MINH (777) =====
INSERT INTO public.vn_wards (code, district_code, name, name_en, ward_type, is_active) VALUES
('27448', '777', 'Phường Bình Hưng Hòa', 'Binh Hung Hoa Ward', 'PHUONG', true),
('27451', '777', 'Phường Bình Hưng Hòa A', 'Binh Hung Hoa A Ward', 'PHUONG', true),
('27454', '777', 'Phường Bình Hưng Hòa B', 'Binh Hung Hoa B Ward', 'PHUONG', true),
('27457', '777', 'Phường Bình Trị Đông', 'Binh Tri Dong Ward', 'PHUONG', true),
('27460', '777', 'Phường Bình Trị Đông A', 'Binh Tri Dong A Ward', 'PHUONG', true),
('27463', '777', 'Phường Bình Trị Đông B', 'Binh Tri Dong B Ward', 'PHUONG', true),
('27466', '777', 'Phường Tân Tạo', 'Tan Tao Ward', 'PHUONG', true),
('27469', '777', 'Phường Tân Tạo A', 'Tan Tao A Ward', 'PHUONG', true),
('27472', '777', 'Phường An Lạc', 'An Lac Ward', 'PHUONG', true),
('27475', '777', 'Phường An Lạc A', 'An Lac A Ward', 'PHUONG', true)
ON CONFLICT (code) DO NOTHING;

-- ===== WARDS - QUẬN HOÀN KIẾM, HÀ NỘI (002) =====
INSERT INTO public.vn_wards (code, district_code, name, name_en, ward_type, is_active) VALUES
('00034', '002', 'Phường Phúc Tân', 'Phuc Tan Ward', 'PHUONG', true),
('00037', '002', 'Phường Đồng Xuân', 'Dong Xuan Ward', 'PHUONG', true),
('00040', '002', 'Phường Hàng Mã', 'Hang Ma Ward', 'PHUONG', true),
('00043', '002', 'Phường Hàng Buồm', 'Hang Buom Ward', 'PHUONG', true),
('00046', '002', 'Phường Hàng Đào', 'Hang Dao Ward', 'PHUONG', true),
('00049', '002', 'Phường Hàng Bồ', 'Hang Bo Ward', 'PHUONG', true),
('00052', '002', 'Phường Cửa Đông', 'Cua Dong Ward', 'PHUONG', true),
('00055', '002', 'Phường Lý Thái Tổ', 'Ly Thai To Ward', 'PHUONG', true),
('00058', '002', 'Phường Hàng Bạc', 'Hang Bac Ward', 'PHUONG', true),
('00061', '002', 'Phường Hàng Gai', 'Hang Gai Ward', 'PHUONG', true),
('00064', '002', 'Phường Chương Dương', 'Chuong Duong Ward', 'PHUONG', true),
('00067', '002', 'Phường Hàng Trống', 'Hang Trong Ward', 'PHUONG', true),
('00070', '002', 'Phường Cửa Nam', 'Cua Nam Ward', 'PHUONG', true),
('00073', '002', 'Phường Hàng Bông', 'Hang Bong Ward', 'PHUONG', true),
('00076', '002', 'Phường Tràng Tiền', 'Trang Tien Ward', 'PHUONG', true),
('00079', '002', 'Phường Trần Hưng Đạo', 'Tran Hung Dao Ward', 'PHUONG', true),
('00082', '002', 'Phường Phan Chu Trinh', 'Phan Chu Trinh Ward', 'PHUONG', true),
('00085', '002', 'Phường Hàng Bài', 'Hang Bai Ward', 'PHUONG', true)
ON CONFLICT (code) DO NOTHING;

-- ===== WARDS - QUẬN HẢI CHÂU, ĐÀ NẴNG (492) =====
INSERT INTO public.vn_wards (code, district_code, name, name_en, ward_type, is_active) VALUES
('20194', '492', 'Phường Thanh Bình', 'Thanh Binh Ward', 'PHUONG', true),
('20195', '492', 'Phường Thuận Phước', 'Thuan Phuoc Ward', 'PHUONG', true),
('20197', '492', 'Phường Thạch Thang', 'Thach Thang Ward', 'PHUONG', true),
('20198', '492', 'Phường Hải Châu I', 'Hai Chau I Ward', 'PHUONG', true),
('20200', '492', 'Phường Hải Châu II', 'Hai Chau II Ward', 'PHUONG', true),
('20203', '492', 'Phường Phước Ninh', 'Phuoc Ninh Ward', 'PHUONG', true),
('20206', '492', 'Phường Hoà Thuận Tây', 'Hoa Thuan Tay Ward', 'PHUONG', true),
('20207', '492', 'Phường Hoà Thuận Đông', 'Hoa Thuan Dong Ward', 'PHUONG', true),
('20209', '492', 'Phường Nam Dương', 'Nam Duong Ward', 'PHUONG', true),
('20212', '492', 'Phường Bình Hiên', 'Binh Hien Ward', 'PHUONG', true),
('20215', '492', 'Phường Bình Thuận', 'Binh Thuan Ward', 'PHUONG', true),
('20218', '492', 'Phường Hoà Cường Bắc', 'Hoa Cuong Bac Ward', 'PHUONG', true),
('20221', '492', 'Phường Hoà Cường Nam', 'Hoa Cuong Nam Ward', 'PHUONG', true)
ON CONFLICT (code) DO NOTHING;

-- ===== THÊM DISTRICTS CHO CÁC TỈNH QUAN TRỌNG =====

-- BÌNH DƯƠNG (74)
INSERT INTO public.vn_districts (code, province_code, name, name_en, district_type, is_active) VALUES
('718', '74', 'Thành phố Thủ Dầu Một', 'Thu Dau Mot City', 'THANH_PHO', true),
('719', '74', 'Huyện Bàu Bàng', 'Bau Bang District', 'HUYEN', true),
('720', '74', 'Huyện Dầu Tiếng', 'Dau Tieng District', 'HUYEN', true),
('721', '74', 'Thị xã Bến Cát', 'Ben Cat Town', 'THI_XA', true),
('722', '74', 'Huyện Phú Giáo', 'Phu Giao District', 'HUYEN', true),
('723', '74', 'Thị xã Tân Uyên', 'Tan Uyen Town', 'THI_XA', true),
('724', '74', 'Thành phố Dĩ An', 'Di An City', 'THANH_PHO', true),
('725', '74', 'Thành phố Thuận An', 'Thuan An City', 'THANH_PHO', true),
('726', '74', 'Huyện Bắc Tân Uyên', 'Bac Tan Uyen District', 'HUYEN', true)
ON CONFLICT (code) DO NOTHING;

-- ĐỒNG NAI (75)
INSERT INTO public.vn_districts (code, province_code, name, name_en, district_type, is_active) VALUES
('731', '75', 'Thành phố Biên Hòa', 'Bien Hoa City', 'THANH_PHO', true),
('732', '75', 'Thành phố Long Khánh', 'Long Khanh City', 'THANH_PHO', true),
('734', '75', 'Huyện Tân Phú', 'Tan Phu District', 'HUYEN', true),
('735', '75', 'Huyện Vĩnh Cửu', 'Vinh Cuu District', 'HUYEN', true),
('736', '75', 'Huyện Định Quán', 'Dinh Quan District', 'HUYEN', true),
('737', '75', 'Huyện Trảng Bom', 'Trang Bom District', 'HUYEN', true),
('738', '75', 'Huyện Thống Nhất', 'Thong Nhat District', 'HUYEN', true),
('739', '75', 'Huyện Cẩm Mỹ', 'Cam My District', 'HUYEN', true),
('740', '75', 'Huyện Long Thành', 'Long Thanh District', 'HUYEN', true),
('741', '75', 'Huyện Xuân Lộc', 'Xuan Loc District', 'HUYEN', true),
('742', '75', 'Huyện Nhơn Trạch', 'Nhon Trach District', 'HUYEN', true)
ON CONFLICT (code) DO NOTHING;

-- VŨNG TÀU (77)
INSERT INTO public.vn_districts (code, province_code, name, name_en, district_type, is_active) VALUES
('747', '77', 'Thành phố Vũng Tàu', 'Vung Tau City', 'THANH_PHO', true),
('748', '77', 'Thành phố Bà Rịa', 'Ba Ria City', 'THANH_PHO', true),
('750', '77', 'Huyện Châu Đức', 'Chau Duc District', 'HUYEN', true),
('751', '77', 'Huyện Xuyên Mộc', 'Xuyen Moc District', 'HUYEN', true),
('752', '77', 'Huyện Long Điền', 'Long Dien District', 'HUYEN', true),
('753', '77', 'Huyện Đất Đỏ', 'Dat Do District', 'HUYEN', true),
('754', '77', 'Thị xã Phú Mỹ', 'Phu My Town', 'THI_XA', true),
('755', '77', 'Huyện Côn Đảo', 'Con Dao District', 'HUYEN', true)
ON CONFLICT (code) DO NOTHING;

-- KHÁNH HÒA (56)
INSERT INTO public.vn_districts (code, province_code, name, name_en, district_type, is_active) VALUES
('568', '56', 'Thành phố Nha Trang', 'Nha Trang City', 'THANH_PHO', true),
('569', '56', 'Thành phố Cam Ranh', 'Cam Ranh City', 'THANH_PHO', true),
('570', '56', 'Huyện Cam Lâm', 'Cam Lam District', 'HUYEN', true),
('571', '56', 'Huyện Vạn Ninh', 'Van Ninh District', 'HUYEN', true),
('572', '56', 'Thị xã Ninh Hòa', 'Ninh Hoa Town', 'THI_XA', true),
('573', '56', 'Huyện Khánh Vĩnh', 'Khanh Vinh District', 'HUYEN', true),
('574', '56', 'Huyện Diên Khánh', 'Dien Khanh District', 'HUYEN', true),
('575', '56', 'Huyện Khánh Sơn', 'Khanh Son District', 'HUYEN', true),
('576', '56', 'Huyện Trường Sa', 'Truong Sa District', 'HUYEN', true)
ON CONFLICT (code) DO NOTHING;

-- CẦN THƠ (92)
INSERT INTO public.vn_districts (code, province_code, name, name_en, district_type, is_active) VALUES
('916', '92', 'Quận Ninh Kiều', 'Ninh Kieu District', 'QUAN', true),
('917', '92', 'Quận Ô Môn', 'O Mon District', 'QUAN', true),
('918', '92', 'Quận Bình Thủy', 'Binh Thuy District', 'QUAN', true),
('919', '92', 'Quận Cái Răng', 'Cai Rang District', 'QUAN', true),
('923', '92', 'Quận Thốt Nốt', 'Thot Not District', 'QUAN', true),
('924', '92', 'Huyện Vĩnh Thạnh', 'Vinh Thanh District', 'HUYEN', true),
('925', '92', 'Huyện Cờ Đỏ', 'Co Do District', 'HUYEN', true),
('926', '92', 'Huyện Phong Điền', 'Phong Dien District', 'HUYEN', true),
('927', '92', 'Huyện Thới Lai', 'Thoi Lai District', 'HUYEN', true)
ON CONFLICT (code) DO NOTHING;
