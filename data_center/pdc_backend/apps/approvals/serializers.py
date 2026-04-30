"""Approvals serializers."""
from rest_framework import serializers
from apps.approvals.models import ProductApprovalRequest


class ApprovalRequestSerializer(serializers.ModelSerializer):
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    product_name_ar = serializers.CharField(source='product.product_name_ar', read_only=True)
    product_category = serializers.CharField(source='product.category.name_ar', read_only=True)
    product_category_en = serializers.CharField(source='product.category.name_en', read_only=True)
    submitted_by_name = serializers.CharField(source='submitted_by.name_ar', read_only=True)
    reviewed_by_name = serializers.SerializerMethodField()
    request_type_display = serializers.CharField(source='get_request_type_display', read_only=True)

    class Meta:
        model = ProductApprovalRequest
        fields = [
            'id', 'product', 'product_sku', 'product_name_ar',
            'product_category', 'product_category_en',
            'request_type', 'request_type_display',
            'submitted_by', 'submitted_by_name',
            'status', 'ai_score', 'ai_auto_approve_eligible', 'ai_validation_result',
            'reviewed_by', 'reviewed_by_name', 'reviewer_notes', 'reviewed_at',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'submitted_by', 'created_at', 'updated_at']

    def get_reviewed_by_name(self, obj):
        return obj.reviewed_by.name_ar if obj.reviewed_by else None

    def create(self, validated_data):
        validated_data['submitted_by'] = self.context['request'].user
        return super().create(validated_data)
