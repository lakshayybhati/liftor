import React from 'react';
import { View, StyleSheet, ImageStyle } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Image as ImageIcon } from 'lucide-react-native';
import { theme } from '@/constants/colors';
import { useAuth } from '@/hooks/useAuth';

interface UserAvatarProps {
    size?: number;
    style?: ImageStyle;
    uri?: string | null; // Allow overriding uri (e.g. for preview in ProfileScreen)
}

export function UserAvatar({ size = 48, style, uri }: UserAvatarProps) {
    const { session } = useAuth();

    // Use provided uri (local state) if present, otherwise fall back to session metadata
    const avatarUrl = (uri !== undefined && uri !== null)
        ? uri
        : (session?.user?.user_metadata?.avatar_url as string | undefined);

    if (avatarUrl) {
        return (
            <ExpoImage
                source={{ uri: avatarUrl }}
                style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
                contentFit="cover"
                cachePolicy="disk"
            />
        );
    }

    return (
        <View style={[
            styles.placeholder,
            { width: size, height: size, borderRadius: size / 2 },
            style
        ]}>
            <ImageIcon color={theme.color.muted} size={size * 0.4} />
        </View>
    );
}

const styles = StyleSheet.create({
    placeholder: {
        backgroundColor: theme.color.card,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: theme.color.line,
    },
});
