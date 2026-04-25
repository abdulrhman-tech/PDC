from rest_framework import serializers
from .models import DecorativeGeneration


class DecorativeGenerationSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    product_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = DecorativeGeneration
        fields = [
            'id', 'product', 'product_name', 'source_image_url',
            'status', 'status_display',
            'vision_analysis', 'generation_settings',
            'prompt_used', 'negative_prompt',
            'kie_task_id', 'result_image_url',
            'error_message',
            'is_multi_product', 'multi_product_data',
            'created_by', 'created_by_name',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'status', 'vision_analysis', 'prompt_used', 'negative_prompt',
            'kie_task_id', 'result_image_url', 'error_message',
            'created_by', 'created_at', 'updated_at',
        ]

    def get_created_by_name(self, obj):
        return obj.created_by.name_ar if obj.created_by else ''

    def get_product_name(self, obj):
        return obj.product.product_name_ar if obj.product else ''


class AnalyzeImageSerializer(serializers.Serializer):
    image_url = serializers.URLField()
    product_id = serializers.IntegerField(required=False)
    material_subtype_hint = serializers.CharField(required=False, default='', allow_blank=True)
    generation_mode_hint = serializers.CharField(required=False, default='', allow_blank=True)


class GenerateDecorativeSerializer(serializers.Serializer):
    generation_id = serializers.IntegerField()
    space_type = serializers.CharField()
    space_type_prompt = serializers.CharField()
    design_style = serializers.CharField()
    design_style_prompt = serializers.CharField()
    lighting = serializers.CharField(required=False, default='')
    lighting_prompt = serializers.CharField(required=False, default='natural daylight streaming through windows')
    camera_angle = serializers.CharField(required=False, default='')
    camera_angle_prompt = serializers.CharField(required=False, default='eye-level perspective')
    lens_type = serializers.CharField(required=False, default='')
    lens_type_prompt = serializers.CharField(required=False, default='wide-angle lens')
    material_focus = serializers.CharField(required=False, default='')
    material_focus_prompt = serializers.CharField(required=False, default='')
    composition = serializers.CharField(required=False, default='')
    composition_prompt = serializers.CharField(required=False, default='rule of thirds')
    mood = serializers.CharField(required=False, default='')
    mood_prompt = serializers.CharField(required=False, default='warm and inviting')
    render_quality = serializers.ChoiceField(
        choices=['preview', 'standard', 'high'],
        default='standard',
    )
    aspect_ratio = serializers.ChoiceField(
        choices=['1:1', '16:9', '9:16', '4:3', '3:4'],
        default='16:9',
    )
    placement = serializers.CharField(required=False, default='main feature')
    override_description_en = serializers.CharField(required=False, default='', allow_blank=True)
    override_generation_mode = serializers.CharField(required=False, default='', allow_blank=True)
    custom_notes = serializers.CharField(required=False, default='', allow_blank=True)


class EnhanceImageSerializer(serializers.Serializer):
    generation_id = serializers.IntegerField()
    background = serializers.ChoiceField(
        choices=['pure_white', 'soft_white', 'light_gray', 'cream'],
        default='pure_white',
    )
    lighting = serializers.ChoiceField(
        choices=['studio', 'soft', 'dramatic', 'top_down'],
        default='studio',
    )
    framing = serializers.ChoiceField(
        choices=['tight', 'normal', 'loose'],
        default='normal',
    )
    shadow = serializers.ChoiceField(
        choices=['natural', 'subtle', 'none'],
        default='natural',
    )
    aspect_ratio = serializers.ChoiceField(
        choices=['1:1', '4:3', '3:4', '16:9', '9:16'],
        default='1:1',
    )
    render_quality = serializers.ChoiceField(
        choices=['preview', 'standard', 'high'],
        default='standard',
    )
    override_description_en = serializers.CharField(required=False, default='', allow_blank=True)
    custom_notes = serializers.CharField(required=False, default='', allow_blank=True)


class MultiProductSlotSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=['floor', 'wall', 'focal', 'accent'])
    image_url = serializers.URLField()
    product_id = serializers.IntegerField(required=False)
    material_subtype_hint = serializers.CharField(required=False, default='', allow_blank=True)
    generation_mode_hint = serializers.CharField(required=False, default='', allow_blank=True)


class AnalyzeMultiSerializer(serializers.Serializer):
    slots = MultiProductSlotSerializer(many=True, min_length=2, max_length=4)

    def validate_slots(self, value):
        roles = [s['role'] for s in value]
        if roles.count('focal') > 1:
            raise serializers.ValidationError('يمكن تحديد منتج رئيسي واحد فقط كبطل المشهد')
        if roles.count('floor') > 1:
            raise serializers.ValidationError('لا يمكن تحديد أكثر من أرضية واحدة')
        if roles.count('wall') > 1:
            raise serializers.ValidationError('لا يمكن تحديد أكثر من جدار واحد')
        return value


class SlotOverrideSerializer(serializers.Serializer):
    index = serializers.IntegerField(min_value=0, max_value=3)
    product_type = serializers.CharField(required=False, allow_blank=True)
    product_type_en = serializers.CharField(required=False, allow_blank=True)
    color = serializers.CharField(required=False, allow_blank=True)
    color_en = serializers.CharField(required=False, allow_blank=True)
    surface = serializers.CharField(required=False, allow_blank=True)
    surface_en = serializers.CharField(required=False, allow_blank=True)
    description_en = serializers.CharField(required=False, allow_blank=True)
    recommended_placement = serializers.CharField(required=False, allow_blank=True)
    material_subtype = serializers.CharField(required=False, allow_blank=True)


class GenerateMultiSerializer(serializers.Serializer):
    generation_id = serializers.IntegerField()
    space_type = serializers.CharField()
    space_type_prompt = serializers.CharField()
    design_style = serializers.CharField()
    design_style_prompt = serializers.CharField()
    lighting = serializers.CharField(required=False, default='')
    lighting_prompt = serializers.CharField(required=False, default='natural daylight streaming through windows')
    camera_angle = serializers.CharField(required=False, default='')
    camera_angle_prompt = serializers.CharField(required=False, default='eye-level perspective')
    mood = serializers.CharField(required=False, default='')
    mood_prompt = serializers.CharField(required=False, default='warm and inviting')
    render_quality = serializers.ChoiceField(
        choices=['preview', 'standard', 'high'],
        default='standard',
    )
    aspect_ratio = serializers.ChoiceField(
        choices=['1:1', '16:9', '9:16', '4:3', '3:4'],
        default='16:9',
    )
    custom_notes = serializers.CharField(required=False, default='', allow_blank=True)
    slot_overrides = SlotOverrideSerializer(many=True, required=False, default=[])
