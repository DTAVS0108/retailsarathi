/// Nest/Prisma `Decimal` fields often arrive as JSON strings (e.g. `"9800"`).
double asDouble(dynamic value, [double fallback = 0]) {
  if (value == null) return fallback;
  if (value is num) return value.toDouble();
  if (value is String) return double.tryParse(value) ?? fallback;
  return fallback;
}

int asInt(dynamic value, [int fallback = 0]) {
  if (value == null) return fallback;
  if (value is num) return value.toInt();
  if (value is String) {
    return int.tryParse(value) ?? double.tryParse(value)?.toInt() ?? fallback;
  }
  return fallback;
}

Map<String, dynamic> asStringKeyedMap(dynamic value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return Map<String, dynamic>.from(value);
  throw FormatException('Expected a JSON object, got ${value.runtimeType}');
}

List<dynamic> asItemList(dynamic raw) {
  if (raw is Map && raw['items'] is List) return raw['items'] as List;
  if (raw is List) return raw;
  return const [];
}

class UserProfile {
  UserProfile({
    required this.id,
    required this.email,
    required this.name,
    required this.role,
    this.tenantId,
  });

  final String id;
  final String email;
  final String name;
  final String role;
  final String? tenantId;

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    return UserProfile(
      id: json['id']?.toString() ?? '',
      email: json['email']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      role: json['role']?.toString() ?? '',
      tenantId: json['tenantId']?.toString(),
    );
  }
}

class DashboardStats {
  DashboardStats({
    required this.todayRevenue,
    required this.todayInvoices,
    required this.totalProducts,
    required this.lowStockCount,
    required this.openRepairs,
    required this.totalCustomers,
    this.recentProducts = const [],
    this.recentInvoices = const [],
    this.lowStockItems = const [],
    this.recentStockMovements = const [],
  });

  final double todayRevenue;
  final int todayInvoices;
  final int totalProducts;
  final int lowStockCount;
  final int openRepairs;
  final int totalCustomers;
  final List<Product> recentProducts;
  final List<InvoiceSummary> recentInvoices;
  final List<Product> lowStockItems;
  final List<StockMovement> recentStockMovements;

  factory DashboardStats.fromJson(Map<String, dynamic> json) {
    List<T> parseList<T>(String key, T Function(Map<String, dynamic>) map) {
      final raw = json[key];
      if (raw is! List) return const [];
      return raw
          .whereType<Map>()
          .map((e) => map(asStringKeyedMap(e)))
          .toList();
    }

    return DashboardStats(
      todayRevenue: asDouble(json['todayRevenue']),
      todayInvoices: asInt(json['todayInvoices']),
      totalProducts: asInt(json['totalProducts']),
      lowStockCount: asInt(json['lowStockCount']),
      openRepairs: asInt(json['openRepairs']),
      totalCustomers: asInt(json['totalCustomers']),
      recentProducts: parseList('recentProducts', Product.fromJson),
      recentInvoices: parseList('recentInvoices', InvoiceSummary.fromJson),
      lowStockItems: parseList('lowStockItems', Product.fromJson),
      recentStockMovements: parseList('recentStockMovements', StockMovement.fromJson),
    );
  }
}

class StockMovement {
  StockMovement({
    required this.id,
    required this.type,
    required this.quantity,
    required this.createdAt,
    required this.productId,
    required this.productName,
    this.productSku,
    this.notes,
  });

  final String id;
  final String type;
  final double quantity;
  final DateTime createdAt;
  final String productId;
  final String productName;
  final String? productSku;
  final String? notes;

  bool get isIn => quantity > 0;

  factory StockMovement.fromJson(Map<String, dynamic> json) {
    return StockMovement(
      id: json['id']?.toString() ?? '',
      type: json['type']?.toString() ?? '',
      quantity: asDouble(json['quantity']),
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ?? DateTime.now(),
      productId: json['productId']?.toString() ?? '',
      productName: json['productName']?.toString() ?? '',
      productSku: json['productSku']?.toString(),
      notes: json['notes']?.toString(),
    );
  }
}

class Product {
  Product({
    required this.id,
    required this.sku,
    required this.name,
    required this.hsnCode,
    required this.salePrice,
    required this.gstRate,
    required this.stockQty,
    this.barcode,
    this.category,
    this.brand,
    this.model,
    this.unit,
    this.purchasePrice,
    this.lowStockThreshold = 5,
    this.isActive = true,
    this.trackSerial = false,
    this.trackBatch = false,
    this.variantLabel,
    this.parentProductId,
    this.serials = const [],
    this.customerCount,
    this.invoiceCount,
    this.lastCustomerName,
    this.lastInvoiceNumber,
    this.buyerNames = const [],
  });

  final String id;
  final String sku;
  final String name;
  final String hsnCode;
  final double salePrice;
  final double gstRate;
  final double stockQty;
  final String? barcode;
  final String? category;
  final String? brand;
  final String? model;
  final String? unit;
  final double? purchasePrice;
  final double lowStockThreshold;
  final bool isActive;
  final bool trackSerial;
  final bool trackBatch;
  final String? variantLabel;
  final String? parentProductId;
  final List<String> serials;
  final int? customerCount;
  final int? invoiceCount;
  final String? lastCustomerName;
  final String? lastInvoiceNumber;
  final List<String> buyerNames;

  String get displayModel {
    final parts = <String>[
      if (brand != null && brand!.trim().isNotEmpty) brand!.trim(),
      if (model != null && model!.trim().isNotEmpty) model!.trim(),
    ];
    return parts.isEmpty ? sku : parts.join(' · ');
  }

  factory Product.fromJson(Map<String, dynamic> json) {
    final serialRaw = json['serials'];
    final serials = <String>[];
    if (serialRaw is List) {
      for (final s in serialRaw) {
        if (s is Map && s['serialNumber'] != null) {
          serials.add(s['serialNumber'].toString());
        } else if (s != null) {
          serials.add(s.toString());
        }
      }
    }
    return Product(
      id: json['id']?.toString() ?? '',
      sku: json['sku']?.toString() ?? '',
      name: json['name']?.toString() ?? '',
      hsnCode: json['hsnCode']?.toString() ?? '',
      salePrice: asDouble(json['salePrice']),
      gstRate: asDouble(json['gstRate']),
      stockQty: asDouble(json['stockQty']),
      barcode: json['barcode']?.toString(),
      category: json['category']?.toString(),
      brand: json['brand']?.toString(),
      model: json['model']?.toString(),
      unit: json['unit']?.toString(),
      purchasePrice: json['purchasePrice'] == null ? null : asDouble(json['purchasePrice']),
      lowStockThreshold: asDouble(json['lowStockThreshold'], 5),
      isActive: json['isActive'] != false,
      trackSerial: json['trackSerial'] == true,
      trackBatch: json['trackBatch'] == true,
      variantLabel: json['variantLabel']?.toString(),
      parentProductId: json['parentProductId']?.toString(),
      serials: serials,
      customerCount: json['customerCount'] == null ? null : asInt(json['customerCount']),
      invoiceCount: json['invoiceCount'] == null ? null : asInt(json['invoiceCount']),
      lastCustomerName: json['lastCustomerName']?.toString(),
      lastInvoiceNumber: json['lastInvoiceNumber']?.toString(),
      buyerNames: (json['buyers'] as List? ?? [])
          .whereType<Map>()
          .map((e) => e['name']?.toString() ?? '')
          .where((n) => n.isNotEmpty)
          .toList(),
    );
  }
}

class InvoiceSummary {
  InvoiceSummary({
    required this.id,
    required this.invoiceNumber,
    required this.grandTotal,
    required this.status,
    required this.createdAt,
    this.updatedAt,
    this.type,
    this.customerName,
    this.customerPhone,
    this.customerEmail,
    this.customerGstin,
    this.paymentMethods = const [],
    this.lineCount = 0,
  });

  final String id;
  final String invoiceNumber;
  final double grandTotal;
  final String status;
  final DateTime createdAt;
  final DateTime? updatedAt;
  final String? type;
  final String? customerName;
  final String? customerPhone;
  final String? customerEmail;
  final String? customerGstin;
  final List<String> paymentMethods;
  final int lineCount;

  bool get isCancelled => status == 'CANCELLED';
  bool get canCancel => status == 'FINALIZED' || status == 'DRAFT';
  bool get isCreditNote => type == 'CREDIT_NOTE';

  factory InvoiceSummary.fromJson(Map<String, dynamic> json) {
    final customer = json['customer'];
    final payments = json['payments'];
    final lines = json['lines'];
    final methods = <String>[];
    if (json['paymentMethods'] is List) {
      for (final m in json['paymentMethods'] as List) {
        if (m != null) methods.add(m.toString());
      }
    } else if (payments is List) {
      for (final p in payments) {
        if (p is Map && p['method'] != null) {
          methods.add(p['method'].toString());
        }
      }
    }
    return InvoiceSummary(
      id: json['id']?.toString() ?? '',
      invoiceNumber: json['invoiceNumber']?.toString() ?? '',
      grandTotal: asDouble(json['grandTotal']),
      status: json['status']?.toString() ?? '',
      type: json['type']?.toString(),
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ?? DateTime.now(),
      updatedAt: DateTime.tryParse(json['updatedAt']?.toString() ?? ''),
      customerName: json['customerName']?.toString() ??
          (customer is Map ? customer['name']?.toString() : null),
      customerPhone: customer is Map ? customer['phone']?.toString() : null,
      customerEmail: customer is Map ? customer['email']?.toString() : null,
      customerGstin: customer is Map ? customer['gstin']?.toString() : null,
      paymentMethods: methods.toSet().toList(),
      lineCount: lines is List ? lines.length : 0,
    );
  }
}
class InvoiceLine {
  InvoiceLine({
    required this.productName,
    required this.hsnCode,
    required this.quantity,
    required this.unitPrice,
    required this.discount,
    required this.gstRate,
    required this.taxableAmount,
    required this.cgst,
    required this.sgst,
    required this.igst,
    required this.total,
    this.productSku,
    this.productBarcode,
  });

  final String productName;
  final String hsnCode;
  final String? productSku;
  final String? productBarcode;
  final double quantity;
  final double unitPrice;
  final double discount;
  final double gstRate;
  final double taxableAmount;
  final double cgst;
  final double sgst;
  final double igst;
  final double total;

  factory InvoiceLine.fromJson(Map<String, dynamic> json) {
    return InvoiceLine(
      productName: json['productName']?.toString() ?? '',
      hsnCode: json['hsnCode']?.toString() ?? '',
      productSku: json['productSku']?.toString(),
      productBarcode: json['productBarcode']?.toString(),
      quantity: asDouble(json['quantity']),
      unitPrice: asDouble(json['unitPrice']),
      discount: asDouble(json['discount']),
      gstRate: asDouble(json['gstRate']),
      taxableAmount: asDouble(json['taxableAmount']),
      cgst: asDouble(json['cgst']),
      sgst: asDouble(json['sgst']),
      igst: asDouble(json['igst']),
      total: asDouble(json['total']),
    );
  }
}

class InvoicePayment {
  InvoicePayment({
    required this.method,
    required this.amount,
    this.reference,
  });

  final String method;
  final double amount;
  final String? reference;

  factory InvoicePayment.fromJson(Map<String, dynamic> json) {
    return InvoicePayment(
      method: json['method']?.toString() ?? '',
      amount: asDouble(json['amount']),
      reference: json['reference']?.toString(),
    );
  }
}

class InvoiceDetail {
  InvoiceDetail({
    required this.id,
    required this.invoiceNumber,
    required this.createdAt,
    required this.status,
    required this.subtotal,
    required this.totalDiscount,
    required this.totalCgst,
    required this.totalSgst,
    required this.totalIgst,
    required this.grandTotal,
    required this.lines,
    required this.payments,
    this.customerName,
    this.customerPhone,
    this.customerEmail,
    this.customerGstin,
    this.notes,
    this.supplyType,
  });

  final String id;
  final String invoiceNumber;
  final DateTime createdAt;
  final String status;
  final double subtotal;
  final double totalDiscount;
  final double totalCgst;
  final double totalSgst;
  final double totalIgst;
  final double grandTotal;
  final List<InvoiceLine> lines;
  final List<InvoicePayment> payments;
  final String? customerName;
  final String? customerPhone;
  final String? customerEmail;
  final String? customerGstin;
  final String? notes;
  final String? supplyType;

  bool get isCancelled => status == 'CANCELLED';
  bool get canCancel => status == 'FINALIZED' || status == 'DRAFT';

  factory InvoiceDetail.fromJson(Map<String, dynamic> json) {
    final customer = json['customer'];
    final linesRaw = json['lines'];
    final paymentsRaw = json['payments'];
    return InvoiceDetail(
      id: json['id']?.toString() ?? '',
      invoiceNumber: json['invoiceNumber']?.toString() ?? '',
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ?? DateTime.now(),
      status: json['status']?.toString() ?? '',
      subtotal: asDouble(json['subtotal']),
      totalDiscount: asDouble(json['totalDiscount']),
      totalCgst: asDouble(json['totalCgst']),
      totalSgst: asDouble(json['totalSgst']),
      totalIgst: asDouble(json['totalIgst']),
      grandTotal: asDouble(json['grandTotal']),
      notes: json['notes']?.toString(),
      supplyType: json['supplyType']?.toString(),
      customerName: customer is Map ? customer['name']?.toString() : null,
      customerPhone: customer is Map ? customer['phone']?.toString() : null,
      customerEmail: customer is Map ? customer['email']?.toString() : null,
      customerGstin: customer is Map ? customer['gstin']?.toString() : null,
      lines: linesRaw is List
          ? linesRaw
              .whereType<Map>()
              .map((e) => InvoiceLine.fromJson(asStringKeyedMap(e)))
              .toList()
          : const [],
      payments: paymentsRaw is List
          ? paymentsRaw
              .whereType<Map>()
              .map((e) => InvoicePayment.fromJson(asStringKeyedMap(e)))
              .toList()
          : const [],
    );
  }
}

class PrintInvoiceData {
  PrintInvoiceData({
    required this.shopName,
    required this.shopAddress,
    required this.invoiceNumber,
    required this.date,
    required this.lines,
    required this.subtotal,
    required this.totalCgst,
    required this.totalSgst,
    required this.totalIgst,
    required this.grandTotal,
    this.gstin,
    this.shopPhone,
    this.customerName,
    this.customerPhone,
    this.customerEmail,
    this.payments = const [],
    this.notes,
    this.templateId,
    this.printHtml,
  });

  final String shopName;
  final String shopAddress;
  final String invoiceNumber;
  final String date;
  final List<PrintLine> lines;
  final double subtotal;
  final double totalCgst;
  final double totalSgst;
  final double totalIgst;
  final double grandTotal;
  final String? gstin;
  final String? shopPhone;
  final String? customerName;
  final String? customerPhone;
  final String? customerEmail;
  final List<InvoicePayment> payments;
  final String? notes;
  final String? templateId;
  final String? printHtml;

  factory PrintInvoiceData.fromJson(Map<String, dynamic> json) {
    final linesRaw = json['lines'];
    final paymentsRaw = json['payments'];
    return PrintInvoiceData(
      shopName: json['shopName']?.toString() ?? 'RetailSarathi',
      shopAddress: json['shopAddress']?.toString() ?? '',
      gstin: json['gstin']?.toString(),
      shopPhone: json['shopPhone']?.toString(),
      invoiceNumber: json['invoiceNumber']?.toString() ?? '',
      date: json['date']?.toString() ?? '',
      customerName: json['customerName']?.toString(),
      customerPhone: json['customerPhone']?.toString(),
      customerEmail: json['customerEmail']?.toString(),
      notes: json['notes']?.toString(),
      templateId: json['templateId']?.toString(),
      printHtml: json['printHtml']?.toString(),
      subtotal: asDouble(json['subtotal']),
      totalCgst: asDouble(json['totalCgst']),
      totalSgst: asDouble(json['totalSgst']),
      totalIgst: asDouble(json['totalIgst']),
      grandTotal: asDouble(json['grandTotal']),
      lines: linesRaw is List
          ? linesRaw
              .whereType<Map>()
              .map((e) => PrintLine.fromJson(asStringKeyedMap(e)))
              .toList()
          : const [],
      payments: paymentsRaw is List
          ? paymentsRaw
              .whereType<Map>()
              .map((e) => InvoicePayment.fromJson(asStringKeyedMap(e)))
              .toList()
          : const [],
    );
  }

  String toReceiptText() {
    final buf = StringBuffer()
      ..writeln(shopName)
      ..writeln(shopAddress);
    if (gstin != null && gstin!.isNotEmpty) buf.writeln('GSTIN: $gstin');
    if (shopPhone != null && shopPhone!.isNotEmpty) buf.writeln('Phone: $shopPhone');
    buf
      ..writeln('--------------------------------')
      ..writeln('Invoice: $invoiceNumber')
      ..writeln('Date: $date');
    if (customerName != null && customerName!.isNotEmpty) {
      buf.writeln('Customer: $customerName');
    }
    if (customerPhone != null && customerPhone!.isNotEmpty) {
      buf.writeln('Phone: $customerPhone');
    }
    if (customerEmail != null && customerEmail!.isNotEmpty) {
      buf.writeln('Email: $customerEmail');
    }
    buf.writeln('--------------------------------');
    for (final line in lines) {
      buf.writeln(line.name);
      buf.writeln(
        '  ${line.qty} × ${line.rate.toStringAsFixed(2)}  GST ${line.gstRate}%  = ${line.amount.toStringAsFixed(2)}',
      );
    }
    buf
      ..writeln('--------------------------------')
      ..writeln('Subtotal: ${subtotal.toStringAsFixed(2)}');
    if (totalCgst > 0) buf.writeln('CGST: ${totalCgst.toStringAsFixed(2)}');
    if (totalSgst > 0) buf.writeln('SGST: ${totalSgst.toStringAsFixed(2)}');
    if (totalIgst > 0) buf.writeln('IGST: ${totalIgst.toStringAsFixed(2)}');
    buf.writeln('TOTAL: ${grandTotal.toStringAsFixed(2)}');
    for (final p in payments) {
      buf.writeln('Paid ${p.method}: ${p.amount.toStringAsFixed(2)}');
    }
    if (notes != null && notes!.isNotEmpty) {
      buf.writeln('Notes: $notes');
    }
    buf.writeln('--------------------------------');
    return buf.toString();
  }
}

class PrintLine {
  PrintLine({
    required this.name,
    required this.qty,
    required this.rate,
    required this.amount,
    required this.gstRate,
    this.hsnCode,
  });

  final String name;
  final double qty;
  final double rate;
  final double amount;
  final double gstRate;
  final String? hsnCode;

  factory PrintLine.fromJson(Map<String, dynamic> json) {
    return PrintLine(
      name: json['name']?.toString() ?? '',
      qty: asDouble(json['qty']),
      rate: asDouble(json['rate']),
      amount: asDouble(json['amount']),
      gstRate: asDouble(json['gstRate']),
      hsnCode: json['hsnCode']?.toString(),
    );
  }
}

class CartLine {
  CartLine({
    required this.product,
    this.quantity = 1,
    this.discount = 0,
    List<String>? serialNumbers,
  }) : serialNumbers = serialNumbers ?? <String>[];

  final Product product;
  int quantity;
  double discount;
  List<String> serialNumbers;

  double get unitPrice => product.salePrice;
  double get taxable => (quantity * unitPrice) - discount;
  double get gstAmount => taxable * (product.gstRate / 100);
  double get lineTotal => taxable + gstAmount;
}
