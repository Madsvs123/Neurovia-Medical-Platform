import React, { useState, useEffect } from 'react';
import {
  Box, Flex, Heading, Text, SimpleGrid, Spinner, useColorModeValue,
  Stat, StatLabel, StatNumber, Divider, Badge, VStack,
} from '@chakra-ui/react';
import { FiSettings, FiServer, FiDatabase, FiClock } from 'react-icons/fi';
import { getUsers, getCourses, getSubscriptions, getPayments } from '../services/api';
import dayjs from 'dayjs';
import { API_BASE_URL } from '../../lib/http';

const Settings = () => {
  const cardBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [u, c, s, p] = await Promise.allSettled([
          getUsers(), getCourses({ limit: 1 }), getSubscriptions({ limit: 1 }), getPayments({ limit: 1 }),
        ]);
        setStats({
          users: u.value?.data?.users?.length || 0,
          courses: c.value?.data?.total || c.value?.data?.courses?.length || 0,
          subscriptions: s.value?.data?.total || s.value?.data?.subscriptions?.length || 0,
          payments: p.value?.data?.payments?.length || 0,
        });
      } catch { /* */ } finally { setLoading(false); }
    };
    fetchStats();
  }, []);

  if (loading) return <Flex justify="center" py={20}><Spinner size="xl" color="teal.500" /></Flex>;

  return (
    <Box maxW="800px">
      <Flex align="center" gap={2} mb={2}>
        <FiSettings size={24} /><Heading size="lg">System Settings</Heading>
      </Flex>
      <Text color="gray.500" mb={6}>System overview and configuration</Text>

      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
        {/* System Info */}
        <Box bg={cardBg} p={6} borderRadius="xl" borderWidth="1px" borderColor={borderColor} shadow="sm">
          <Heading size="sm" mb={4} display="flex" alignItems="center" gap={2}><FiServer /> System</Heading>
          <VStack spacing={3} align="stretch">
            <InfoRow label="Version" value="Neurovia v1.0.0" />
            <InfoRow label="Environment" value={import.meta.env.MODE || 'production'} badge />
            <InfoRow label="API URL" value={API_BASE_URL || window.location.origin} />
            <InfoRow label="Build Time" value={dayjs().format('MMM D, YYYY h:mm A')} />
          </VStack>
        </Box>

        {/* Database Stats */}
        <Box bg={cardBg} p={6} borderRadius="xl" borderWidth="1px" borderColor={borderColor} shadow="sm">
          <Heading size="sm" mb={4} display="flex" alignItems="center" gap={2}><FiDatabase /> Database</Heading>
          <SimpleGrid columns={2} spacing={4}>
            <StatBox label="Users" value={stats.users} />
            <StatBox label="Courses" value={stats.courses} />
            <StatBox label="Subscriptions" value={stats.subscriptions} />
            <StatBox label="Payments" value={stats.payments} />
          </SimpleGrid>
        </Box>

        {/* Time Info */}
        <Box bg={cardBg} p={6} borderRadius="xl" borderWidth="1px" borderColor={borderColor} shadow="sm">
          <Heading size="sm" mb={4} display="flex" alignItems="center" gap={2}><FiClock /> Server Time</Heading>
          <VStack spacing={3} align="stretch">
            <InfoRow label="Current Time" value={dayjs().format('MMMM D, YYYY h:mm:ss A')} />
            <InfoRow label="Timezone" value={Intl.DateTimeFormat().resolvedOptions().timeZone} />
            <InfoRow label="Locale" value={navigator.language} />
          </VStack>
        </Box>

        {/* Admin Info */}
        <Box bg={cardBg} p={6} borderRadius="xl" borderWidth="1px" borderColor={borderColor} shadow="sm">
          <Heading size="sm" mb={4}>Admin Panel</Heading>
          <VStack spacing={3} align="stretch">
            <InfoRow label="Framework" value="React + Chakra UI" />
            <InfoRow label="Charts" value="Recharts" />
            <InfoRow label="State" value="Redux Toolkit" />
            <InfoRow label="HTTP" value="Axios" />
          </VStack>
        </Box>
      </SimpleGrid>
    </Box>
  );
};

const InfoRow = ({ label, value, badge }) => (
  <Flex justify="space-between" align="center">
    <Text fontSize="sm" color="gray.500">{label}</Text>
    {badge ? <Badge fontSize="xs">{value}</Badge> : <Text fontSize="sm" fontWeight="medium">{value}</Text>}
  </Flex>
);

const StatBox = ({ label, value }) => (
  <Stat>
    <StatLabel fontSize="xs">{label}</StatLabel>
    <StatNumber fontSize="xl">{value}</StatNumber>
  </Stat>
);

export default Settings;
